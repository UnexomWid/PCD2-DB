var socket;
var messagesShownNo;

var messageId = 0;
var messagesMap = {};
var userLanguage;
var userName;
var partnerLanguage;
var partnerName;
var actionCardTimeout;

const CHAT_SECTION = 'chat';
const STATS_SECTION = 'stats';
const moodNames = ['very-dissatisfied', 'dissatisfied', 'neutral', 'satisfied', 'very-satisfied'];
const moodIcons = [
    `<span class="material-symbols-rounded">sentiment_very_dissatisfied</span>`,
    `<span class="material-symbols-rounded">sentiment_dissatisfied</span>`,
    `<span class="material-symbols-rounded">sentiment_neutral</span>`,
    `<span class="material-symbols-rounded">sentiment_satisfied</span>`,
    `<span class="material-symbols-rounded">sentiment_very_satisfied</span>`
];

addEventListener('DOMContentLoaded', () => {
    initializeHtml();

    initializeForm();

    initializeMenu();
});

const initializeHtml = () => {
    document.querySelector('#name').focus();
    messagesShownNo = document.querySelectorAll('.message-container').length;
}

const initializeWebSocket = () => {
    // socket = io("ws://127.0.0.1:3004");
    socket = io("wss://pcd2.exom.dev");

    socket.on('room', (id) => {
        addSystemMessage(`Connected to room ${id}.`);
    });

    socket.on('joined', (req) => {
        partnerName = req.name;
        partnerLanguage = req.language;
        document.querySelector('.info-profile.roommate .info-name span').innerHTML = partnerName;
        document.querySelector('.info-profile.roommate .info-language span').innerHTML = partnerLanguage;
        addSystemMessage(`${req.name} joined the room. Language is ${req.language}.`);
    });

    socket.on('message', (req) => {
        if(req.type === 'text') addTextMessage(false, req.body);
    })

    socket.on('left', () => {
        addSystemMessage(`${partnerName} left the room.`);
    });

    userName = document.getElementById('name').value;
    userLanguage = document.getElementById('languages-select').value;
    socket.emit('setup', {
        name: userName,
        language: userLanguage
    });
    document.querySelector('.info-profile.you .info-name span').innerHTML = userName;
    document.querySelector('.info-profile.you .info-language span').innerHTML = userLanguage;
}

const initializeForm = () => {
    const messages = document.querySelector('.messages');

    deleteLastMessage = () => {
        setTimeout(() => {
            messages.removeChild(messages.firstElementChild);
            messagesShownNo -= 1;
            if(messagesShownNo > 0) deleteLastMessage();
        }, 50);
    }

    document.querySelector('.form-section form').addEventListener('submit', (event) => {
        event.preventDefault();

        initializeWebSocket();
        

        document.querySelector('.form-section').classList.add('form-section--hidden');
        document.querySelector('.form-section-scaffold').classList.add('form-section-scaffold--hidden');
        document.querySelector('.chat-section').classList.remove('chat-section--blurred');
        document.querySelector('.chat-column').classList.remove('chat-column--blurred');
        document.querySelector('.chat-column--blurred--overlay').classList.add('chat-column--blurred--overlay--hidden');

        setTimeout(() => {
            document.querySelector('.action-section').classList.remove('action-section--hidden');
            document.querySelector('.info-section').classList.remove('info-section--hidden');
            document.querySelector('.form-section').remove();
            document.querySelector('.form-section-scaffold').remove();
            document.querySelector('.input').focus();
            document.querySelector('.chat-column--blurred--overlay').remove();
        }, 800);

        deleteLastMessage();


        initializeChat();
    });
}

const initializeChat = () => {
    const textInput = document.querySelector('.input-container .input');
    const messagesList = document.querySelector('.messages');
    const sendMessage = () => {
        addTextMessage(true, textInput.value);
        socket.emit('send', {
            type: 'text',
            body: textInput.value
        });
        textInput.value = '';
    }


    document.addEventListener('keypress', (event) => {
        if(document.activeElement === textInput && event.key === 'Enter') sendMessage();
    })
    document.querySelector('.send-button').addEventListener('click', () => sendMessage());
    document.querySelector('.chat-section').addEventListener('click', () => document.querySelector('.input-container .input').focus());

    const target = document.querySelector('.messages');

    const observer = new MutationObserver((mutations) => {
        mutations.forEach(() => {
            messagesList.scrollTop = messagesList.scrollHeight;
        });    
    });
    var config = { attributes: true, childList: true, characterData: true };
    observer.observe(target, config);

}

const initializeMenu = () => {
    const cards = document.querySelectorAll('.action-card');
    for(const card of cards) {
        card.addEventListener('click', (event) => {
            if(actionCardTimeout) {
                clearTimeout(actionCardTimeout);
                actionCardTimeout = undefined;
            }
            let selectedSectionName = event.target.getAttribute('data-section-name');
            if(!selectedSectionName) selectedSectionName = event.target.parentElement.getAttribute('data-section-name');

            document.querySelector('.action-card--selected').classList.remove('action-card--selected');
            card.classList.add('action-card--selected');

            for(const c of cards) {
                const cardSectionName = c.getAttribute('data-section-name');
                if(selectedSectionName === STATS_SECTION) {
                    fetchMoodswings();
                    fetchStats();
                }

                if(cardSectionName === selectedSectionName) {
                    document.querySelector(`.chat-section .${cardSectionName}`).classList.remove(`${cardSectionName}--hidden`);
                } else {
                    document.querySelector(`.chat-section .${cardSectionName}`).classList.add(`${cardSectionName}--hidden`);
                }
            }
        });
    }
}

const addTextMessage = (mine, text) => {
    const id = messageId;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message-container');
    messageDiv.setAttribute('data-message-id', id);
    messageDiv.innerHTML = `
        <div class="message-box ${mine ? 'mine' : 'theirs'}">
            <span>${text}</span>
        </div>
        <div class="message-actions ${mine ? 'mine' : 'theirs'}">
            ${mine ? '' : ' \
                <div class="message-translate-icon" onclick="translateMessage(\'' + id + '\')">\
                    <span class="material-symbols-rounded">translate</span>\
                </div>\
            '}
            <div class="message-mood-icon" onclick="showMessageMood(\'${id}\')">
                <span class="material-symbols-rounded">question_mark</span>
            </div>
        </div>
    `;
    document.querySelector('.messages').appendChild(messageDiv);

    messagesMap[messageId] = {
        id: id,
        mine: mine,
        text: text,
        language: mine ? userLanguage : partnerLanguage,
        isTranslationShowing: false,
        isMoodShowing: false,
        translation: undefined,
        mood: undefined,
        elementRef: messageDiv
    };

    messageId += 1;
}

const addSystemMessage = (text) => {
    document.querySelector('.messages').innerHTML += `
        <div class="message-container">
            <div class="message-box system">
                <span>${text}</span>
            </div>
        </div>
    `;
}

const translateMessage = (messageId, forceTranslate) => {
    const elementInfo = messagesMap[messageId];
    if(!elementInfo) {
        console.log('element not found?', elementInfo, messageId);
        return;
    }
    if(elementInfo.isTranslationShowing && !forceTranslate) {
        elementInfo.elementRef.querySelector('.message-box span').innerHTML = elementInfo.text;
        elementInfo.isTranslationShowing = false;
        return;
    }
    if(!elementInfo.translation) {
        fetchTextElementInfo(elementInfo, true, false);
        return;
    }
    elementInfo.elementRef.querySelector('.message-box span').innerHTML = elementInfo.translation;
    elementInfo.isTranslationShowing = true;
}

const showMessageMood = (messageId) => {
    const elementInfo = messagesMap[messageId];
    if(!elementInfo) {;
        console.log('element not found?', elementInfo, messageId);
        return;
    }
    if(elementInfo.isMoodShowing) return;
    if(!elementInfo.mood && elementInfo.mood !== 0) {
        fetchTextElementInfo(elementInfo, false, true);
        return;
    }

    const moodIndex = Math.floor((elementInfo.mood + 1) / 2 * 5);

    elementInfo.elementRef.querySelector('.message-mood-icon').remove();
    elementInfo.elementRef.querySelector('.message-actions').innerHTML += `
        <div class="message-mood-${moodNames[moodIndex]} message-mood-status">
            ${moodIcons[moodIndex]}
        </div>
    `;
    elementInfo.isMoodShowing = true;
}

const fetchTextElementInfo = async (elementInfo, showTranslation, showMood) => {
    axios.post('https://serverse.ew.r.appspot.com/analyze', {
        type: 'text',
        data: elementInfo.text,
        from: partnerLanguage ?? userLanguage,
        to: userLanguage ?? partnerLanguage
    }).then((response) => {
        elementInfo.translation = response.data.translation;
        elementInfo.mood = response.data.sentiment;
        if(showTranslation) translateMessage(elementInfo.id);
        if(showMood) showMessageMood(elementInfo.id);
    }).catch((error) => {
        console.log(error);
    });
}

const translateAll = () => {
    for(const messageId in messagesMap) {
        if(messagesMap[messageId].mine) continue;
        translateMessage(messageId, true);
    }
}

const moodAll = () => {
    for(const messageId in messagesMap) {
        showMessageMood(messageId);
    }
}

const fetchMoodswings = async () => {
    const moodList = [];
    for(let messageId in messagesMap) {
        moodList.push(messagesMap[messageId].mood);
    }
    axios.post('https://us-central1-serverse.cloudfunctions.net/function-4', {
        data: moodList
    }).then((response) => {
        document.querySelector('.stats-moodswings span').innerHTML = response.data.moodswings;
    }).catch((error) => {
        console.log(error);
    });
}

const fetchStats = async () => {
    axios.get('https://pcd2.exom.dev/stats').then((response) => {
        console.log('stats reponse:');
        console.log(response.data);
        let countriesDataString = '';
        for(const country in response.data) {
            countriesDataString += `<br><span>${country}: ${response.data[country]}</span>`
        }
        document.querySelector('.stats-countries span').innerHTML = countriesDataString;
    }).catch((error) => {
        console.log(error);
    });
}
