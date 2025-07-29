const socket = io();

// --- UI Element References ---
const usernameSection = document.getElementById('username-section');
const usernameInput = document.getElementById('username-input');
const colorInput = document.getElementById('color-input');
const setUsernameBtn = document.getElementById('set-username-btn');
const usernameError = document.getElementById('username-error');
const chatMain = document.getElementById('chat-main');

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const emojiPickerBtn = document.getElementById('emoji-picker-btn');
const emojiContainer = document.getElementById('emoji-container');
const mentionSuggestions = document.getElementById('mention-suggestions');

const replyPreview = document.getElementById('reply-preview');
const replyToUserSpan = document.getElementById('reply-to-user');
const replyToMessageSpan = document.getElementById('reply-to-message');
const cancelReplyBtn = document.getElementById('cancel-reply');

const profileIcon = document.getElementById('profile-icon');
const profileModal = document.getElementById('profile-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalUsernameInput = document.getElementById('modal-username-input');
const modalColorInput = document.getElementById('modal-color-input');
const saveProfileBtn = document.getElementById('save-profile-btn');
const profileError = document.getElementById('profile-error');

const typingIndicator = document.getElementById('typing-indicator');
const typingMessage = document.getElementById('typing-message');

// --- State Variables ---
let currentUsername = null;
let currentUserColor = null;
let replyData = {
    id: null,
    user: null,
    text: null
};
let typingTimeout;
const TYPING_TIMER_LENGTH = 1000;
const typingUsers = new Set();

let activeUsersForMentions = []; // Stores list of active users for mention suggestions
let currentMentionQuery = '';
let mentionSelectionIndex = -1;

// Drag-to-reply state
let touchStartX = 0;
let touchStartY = 0;
let touchCurrentX = 0;
let isDragging = false;
let draggedMessageElement = null;
const DRAG_THRESHOLD = 50; // Pixels to drag to trigger reply

const commonEmojis = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😟', '😠', '😡', '🤬', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '😇', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😢', '😭', '😤', '😥', '😩', '🥱', '😴', '🤤', '😪', '😵', '🤯', '🥳'];

// --- Initial Load & Socket Connection Handling ---
document.addEventListener('DOMContentLoaded', () => {
    // Attempt to load username and color from localStorage
    const storedUsername = localStorage.getItem('chatify_username');
    const storedColor = localStorage.getItem('chatify_color');

    // Set default color for color input
    colorInput.value = storedColor || '#007bff'; // Set to messenger blue if no stored color

    if (storedUsername && storedColor) {
        // Try to rejoin chat immediately
        attemptLogin(storedUsername, storedColor);
    } else {
        // No stored credentials, show username input
        showUsernameSection();
    }

    populateEmojis();
});

// Function to handle login attempt (rejoin or first time)
function attemptLogin(username, color) {
    socket.emit('set username and color', { username: username, color: color }, (response) => {
        if (response.success) {
            currentUsername = username;
            currentUserColor = color;
            localStorage.setItem('chatify_username', username);
            localStorage.setItem('chatify_color', color);
            profileIcon.style.color = currentUserColor; // Update profile icon color here
            enterChat();
            console.log('Successfully joined/rejoined chat with username:', currentUsername);
        } else {
            // Login failed (e.g., username taken)
            usernameError.textContent = response.message || 'Could not join. Please choose a new username.';
            showUsernameSection();
            // Clear stored data if the username was taken (to avoid endless attempts with bad name)
            if (response.message && response.message.includes('Username is already taken')) {
                localStorage.removeItem('chatify_username');
                localStorage.removeItem('chatify_color');
            }
        }
    });
}

// --- UI Display Functions ---
function showUsernameSection() {
    usernameSection.style.display = 'flex';
    chatMain.style.display = 'none';
    profileIcon.style.color = '#007bff'; // Reset profile icon to default blue when on login screen
    usernameInput.focus();
}

function enterChat() {
    usernameSection.style.display = 'none';
    chatMain.style.display = 'flex';
    profileIcon.style.color = currentUserColor; // Set profile icon to user's chosen color
    usernameError.textContent = '';
    input.focus();
}


// --- Socket Event Listeners ---
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    // On reconnect, re-attempt login with stored credentials if available
    const storedUsername = localStorage.getItem('chatify_username');
    const storedColor = localStorage.getItem('chatify_color');
    if (storedUsername && storedColor && !currentUsername) { // Only attempt if not already logged in
        attemptLogin(storedUsername, storedColor);
    } else if (currentUsername) {
        // If already logged in (e.g., just a temporary disconnect), re-emit set username
        attemptLogin(currentUsername, currentUserColor);
    }
});

socket.on('past messages', (pastMessages) => {
    messages.innerHTML = '';
    pastMessages.forEach(msg => appendMessage(msg, false));
    messages.scrollTop = messages.scrollHeight; // Scroll to bottom after loading past messages
});

socket.on('chat message', (data) => {
    appendMessage(data);
});

socket.on('user joined', (data) => {
    if (data.username !== currentUsername) { // Prevent showing system message for self
        const item = document.createElement('div');
        item.classList.add('system-message');
        item.innerHTML = `<span style="color:${data.color || 'var(--primary-color)'}; font-weight:bold;">${data.username}</span> has joined the chat.`;
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }
});

socket.on('user left', (username) => {
    if (username !== currentUsername) { // Prevent showing system message for self
        const item = document.createElement('div');
        item.classList.add('system-message');
        item.textContent = `${username} has left the chat.`;
        messages.appendChild(item);
        messages.scrollTop = messages.scrollHeight;
    }
});

socket.on('user typing', (data) => {
    if (data.username !== currentUsername) {
        typingUsers.add(data.username);
        updateTypingIndicator();
    }
});

socket.on('user stop typing', (data) => {
    typingUsers.delete(data.username);
    updateTypingIndicator();
});

socket.on('active users list', (users) => {
    // Filter out the current user for mention suggestions
    activeUsersForMentions = users.filter(user => user.username !== currentUsername);
});

socket.on('error', (message) => {
    console.error('Server Error:', message);
    alert(`Error: ${message}`);
    if (message.includes('Username is already taken') || message.includes('Authentication required')) {
        currentUsername = null;
        currentUserColor = null;
        localStorage.removeItem('chatify_username');
        localStorage.removeItem('chatify_color');
        showUsernameSection();
    }
});

// --- User Join/Login Handling ---
setUsernameBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const color = colorInput.value;

    if (username && color) {
        attemptLogin(username, color);
    } else {
        usernameError.textContent = 'Username and color cannot be empty.';
    }
});

usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        setUsernameBtn.click();
    }
});

// --- Typing Indicators ---
input.addEventListener('input', () => {
    if (currentUsername) {
        socket.emit('typing');
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('stop typing');
        }, TYPING_TIMER_LENGTH);
    }
    handleMentionInput(); // Check for mentions on every input
});

function updateTypingIndicator() {
    if (typingUsers.size > 0) {
        let message = '';
        const usersArray = Array.from(typingUsers);
        if (usersArray.length === 1) {
            message = `${usersArray[0]} is typing`;
        } else if (usersArray.length === 2) {
            message = `${usersArray[0]} and ${usersArray[1]} are typing`;
        } else {
            message = 'Multiple users are typing';
        }
        typingMessage.textContent = message;
        typingIndicator.style.display = 'flex';
    } else {
        typingIndicator.style.display = 'none';
    }
}

// --- Chat Message Handling ---
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const messageText = input.value.trim();

    if (messageText && currentUsername) {
        const messageToSend = {
            message: messageText,
            mentions: parseMentionsFromInput(messageText) // Extract mentions before sending
        };

        if (replyData.id) {
            messageToSend.replyToId = replyData.id;
            messageToSend.replyToText = replyData.text;
            messageToSend.replyToUser = replyData.user;
        }

        socket.emit('chat message', messageToSend);
        input.value = '';
        clearReplyState();
        socket.emit('stop typing'); // User stops typing after sending a message
        hideMentionSuggestions(); // Hide suggestions after sending
    } else if (!currentUsername) {
        alert('Please set your username and color first!');
    }
});

function appendMessage(data, scroll = true) {
    const item = document.createElement('div');
    item.classList.add('message-item');
    item.dataset.messageId = data.id;
    item.dataset.messageUser = data.user;
    item.dataset.messageText = data.message;

    if (data.user === currentUsername) {
        item.classList.add('own-message');
    } else {
        item.classList.add('other-message');
    }

    // Only show username for other messages in Messenger style
    if (data.user !== currentUsername) {
        const usernameSpan = document.createElement('span');
        usernameSpan.classList.add('username');
        usernameSpan.textContent = data.user;
        usernameSpan.style.color = data.color || 'var(--text-color)'; // Use user's color for their name
        item.appendChild(usernameSpan);
    }


    if (data.replyToId && data.replyToText && data.replyToUser) {
        const replyContentDiv = document.createElement('div');
        replyContentDiv.classList.add('reply-content');
        replyContentDiv.innerHTML = `<strong>${data.replyToUser}</strong>: "${escapeHTML(data.replyToText)}"`; // Escape HTML to prevent XSS
        replyContentDiv.addEventListener('click', () => {
            const originalMessage = document.querySelector(`.message-item[data-message-id="${data.replyToId}"]`);
            if (originalMessage) {
                originalMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
                originalMessage.style.transition = 'background-color 0.3s ease';
                originalMessage.style.backgroundColor = 'rgba(255, 255, 0, 0.2)';
                setTimeout(() => {
                    originalMessage.style.backgroundColor = '';
                }, 1000);
            }
        });
        item.appendChild(replyContentDiv);
    }

    const messageContentDiv = document.createElement('div');
    messageContentDiv.classList.add('message-content');
    messageContentDiv.innerHTML = formatMessageWithMentions(escapeHTML(data.message), data.mentions); // Escape HTML for main message too
    item.appendChild(messageContentDiv);

    const timestampSpan = document.createElement('span');
    timestampSpan.classList.add('timestamp');
    timestampSpan.textContent = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    item.appendChild(timestampSpan);

    const messageActions = document.createElement('div');
    messageActions.classList.add('message-actions');

    const replyIcon = document.createElement('i');
    replyIcon.classList.add('fas', 'fa-reply', 'action-icon');
    replyIcon.title = 'Reply to this message';
    replyIcon.addEventListener('click', () => {
        setReplyState(data.id, data.user, data.message);
    });
    messageActions.appendChild(replyIcon);

    item.appendChild(messageActions);

    // Add drag-to-reply indicator for mobile
    const replySwipeIndicator = document.createElement('div');
    replySwipeIndicator.classList.add('reply-swipe-indicator');
    replySwipeIndicator.innerHTML = '<i class="fas fa-reply"></i>';
    item.appendChild(replySwipeIndicator);

    messages.appendChild(item);
    if (scroll) {
        messages.scrollTop = messages.scrollHeight;
    }
}

// --- Reply Logic ---
function setReplyState(id, user, text) {
    replyData.id = id;
    replyData.user = user;
    replyData.text = text;

    replyToUserSpan.textContent = user;
    replyToMessageSpan.textContent = text;
    replyPreview.style.display = 'flex';
    input.focus();
}

function clearReplyState() {
    replyData.id = null;
    replyData.user = null;
    replyData.text = null;
    replyPreview.style.display = 'none';
    replyToUserSpan.textContent = '';
    replyToMessageSpan.textContent = '';
}

cancelReplyBtn.addEventListener('click', clearReplyState);

// --- Profile Modal Logic ---
profileIcon.addEventListener('click', () => {
    if (currentUsername && currentUserColor) {
        modalUsernameInput.value = currentUsername;
        modalColorInput.value = currentUserColor;
        profileModal.style.display = 'flex';
        setTimeout(() => {
            profileModal.classList.add('show');
        }, 10);
        profileError.textContent = '';
    }
});

closeModalBtn.addEventListener('click', () => {
    profileModal.classList.remove('show');
    setTimeout(() => {
        profileModal.style.display = 'none';
    }, 300);
});

window.addEventListener('click', (event) => {
    if (event.target == profileModal) {
        profileModal.classList.remove('show');
        setTimeout(() => {
            profileModal.style.display = 'none';
        }, 300);
    }
});

saveProfileBtn.addEventListener('click', () => {
    const newColor = modalColorInput.value;

    if (newColor && newColor !== currentUserColor) {
        // Attempt to update color on the server as well (re-emit set username and color)
        // This is important so future messages use the new color and other users see it
        socket.emit('set username and color', { username: currentUsername, color: newColor }, (response) => {
            if (response.success) {
                currentUserColor = newColor;
                localStorage.setItem('chatify_color', newColor);
                profileIcon.style.color = newColor; // Update the actual profile icon
                profileModal.classList.remove('show');
                setTimeout(() => {
                    profileModal.style.display = 'none';
                }, 300);
                alert('Your color has been updated! New messages will use this color.');
            } else {
                profileError.textContent = response.message || 'Failed to update color.';
            }
        });
    } else {
        profileError.textContent = 'No changes or invalid color.';
    }
});

// --- Emoji Picker Logic ---
emojiPickerBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    hideMentionSuggestions();
    emojiContainer.style.display = emojiContainer.style.display === 'flex' ? 'none' : 'flex';
});

function populateEmojis() {
    commonEmojis.forEach(emoji => {
        const span = document.createElement('span');
        span.textContent = emoji;
        span.addEventListener('click', () => {
            input.value += emoji;
            input.focus();
            emojiContainer.style.display = 'none';
        });
        emojiContainer.appendChild(span);
    });
}

document.addEventListener('click', (event) => {
    if (emojiContainer.style.display === 'flex' && !emojiContainer.contains(event.target) && event.target !== emojiPickerBtn) {
        emojiContainer.style.display = 'none';
    }
});

// --- Mention System Logic ---
input.addEventListener('keydown', (e) => {
    if (mentionSuggestions.style.display === 'block') {
        const suggestions = Array.from(mentionSuggestions.querySelectorAll('li'));
        if (suggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            mentionSelectionIndex = (mentionSelectionIndex + 1) % suggestions.length;
            updateMentionSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            mentionSelectionIndex = (mentionSelectionIndex - 1 + suggestions.length) % suggestions.length;
            updateMentionSelection();
        } else if (e.key === 'Enter' && mentionSelectionIndex !== -1) {
            e.preventDefault();
            selectMention(suggestions[mentionSelectionIndex].dataset.username);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideMentionSuggestions();
        }
    }
});

function handleMentionInput() {
    const cursorPosition = input.selectionStart;
    const textBeforeCursor = input.value.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
        const potentialQuery = textBeforeCursor.substring(lastAtIndex + 1);
        // Ensure it's a valid mention start (not part of a word)
        if (lastAtIndex === 0 || /\s/.test(textBeforeCursor[lastAtIndex - 1]) || textBeforeCursor[lastAtIndex - 1] === undefined) {
            currentMentionQuery = potentialQuery;
            showMentionSuggestions(currentMentionQuery);
            return;
        }
    }
    hideMentionSuggestions();
}

function showMentionSuggestions(query) {
    // Filter active users for mentions (case-insensitive, starts with query)
    const filteredUsers = activeUsersForMentions.filter(user =>
        user.username.toLowerCase().startsWith(query.toLowerCase())
    ).sort((a, b) => a.username.localeCompare(b.username)); // Sort alphabetically

    mentionSuggestions.innerHTML = '';
    const ul = document.createElement('ul');

    if (filteredUsers.length > 0) {
        filteredUsers.forEach(user => {
            const li = document.createElement('li');
            li.dataset.username = user.username;
            li.innerHTML = `<span style="color:${user.color || 'var(--primary-color)'}; font-weight:bold;">${user.username}</span>`;
            li.addEventListener('click', () => selectMention(user.username));
            ul.appendChild(li);
        });
        mentionSuggestions.appendChild(ul);
        mentionSuggestions.style.display = 'block';
        mentionSelectionIndex = -1;
    } else {
        hideMentionSuggestions();
    }
}

function hideMentionSuggestions() {
    mentionSuggestions.style.display = 'none';
    mentionSuggestions.innerHTML = '';
    mentionSelectionIndex = -1;
    currentMentionQuery = '';
}

function updateMentionSelection() {
    const suggestions = Array.from(mentionSuggestions.querySelectorAll('li'));
    suggestions.forEach((li, index) => {
        li.classList.toggle('selected', index === mentionSelectionIndex);
    });
    if (mentionSelectionIndex !== -1) {
        suggestions[mentionSelectionIndex].scrollIntoView({ block: 'nearest' });
    }
}

function selectMention(username) {
    const cursorPosition = input.selectionStart;
    const textBeforeCursor = input.value.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
        const newText = input.value.substring(0, lastAtIndex) + `@${username} ` + input.value.substring(cursorPosition);
        input.value = newText;
        input.selectionStart = input.selectionEnd = lastAtIndex + username.length + 2;
    }
    hideMentionSuggestions();
    input.focus();
}

function parseMentionsFromInput(message) {
    const mentions = [];
    const regex = /@([a-zA-Z0-9_]+)/g;
    let match;
    while ((match = regex.exec(message)) !== null) {
        const mentionedUsername = match[1];
        if (activeUsersForMentions.some(user => user.username === mentionedUsername) || mentionedUsername === currentUsername) {
            mentions.push(mentionedUsername);
        }
    }
    return [...new Set(mentions)];
}

function formatMessageWithMentions(message, mentions) {
    let formattedText = message;
    if (mentions && mentions.length > 0) {
        mentions.forEach(mention => {
            // Use a regex to replace all occurrences of @mention with a styled span
            const mentionRegex = new RegExp(`@${mention}(?=\\b|\\s|$)`, 'g'); // Ensure whole word match
            formattedText = formattedText.replace(mentionRegex, `<span class="mention" data-username="${mention}">@${mention}</span>`);
        });
    }
    return formattedText;
}

// Attach click listener to mentions in messages (delegated)
messages.addEventListener('click', (e) => {
    if (e.target.classList.contains('mention')) {
        const username = e.target.dataset.username;
        alert(`You clicked on @${username}!`);
    }
});


// --- Drag-to-Reply (Mobile Swipe) Features ---
messages.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        // Find the closest message item
        draggedMessageElement = e.target.closest('.message-item');
        if (draggedMessageElement) {
            draggedMessageElement.classList.add('drag-active');
        }
        isDragging = true;
    }
}, { passive: true }); // Use passive to improve scroll performance

messages.addEventListener('touchmove', (e) => {
    if (!isDragging || !draggedMessageElement || e.touches.length !== 1) return;

    touchCurrentX = e.touches[0].clientX;
    const deltaX = touchCurrentX - touchStartX;
    const deltaY = e.touches[0].clientY - touchStartY;

    // Prevent vertical scrolling if horizontal drag is dominant
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) { // Small threshold to differentiate from accidental tap
        e.preventDefault();
        const translateValue = Math.max(0, Math.min(Math.abs(deltaX), 80)); // Limit drag distance
        if (draggedMessageElement.classList.contains('own-message')) {
            draggedMessageElement.style.transform = `translateX(${Math.min(0, deltaX)}px)`; // Drag left for own messages
            draggedMessageElement.querySelector('.reply-swipe-indicator').style.width = `${translateValue}px`;
        } else {
            draggedMessageElement.style.transform = `translateX(${Math.max(0, deltaX)}px)`; // Drag right for others' messages
            draggedMessageElement.querySelector('.reply-swipe-indicator').style.width = `${translateValue}px`;
        }
    }
}, { passive: false }); // Needs to be non-passive to call preventDefault

messages.addEventListener('touchend', (e) => {
    if (!isDragging || !draggedMessageElement) return;

    const deltaX = touchCurrentX - touchStartX;

    // Determine if it was a significant drag for reply
    const shouldReply = Math.abs(deltaX) > DRAG_THRESHOLD;

    if (shouldReply) {
        const messageId = draggedMessageElement.dataset.messageId;
        const messageUser = draggedMessageElement.dataset.messageUser;
        const messageText = draggedMessageElement.dataset.messageText;
        setReplyState(messageId, messageUser, messageText);
    }

    // Reset styles regardless of whether reply was triggered
    draggedMessageElement.style.transform = 'translateX(0)';
    draggedMessageElement.classList.remove('drag-active');
    draggedMessageElement.querySelector('.reply-swipe-indicator').style.width = '0';

    // Reset state
    isDragging = false;
    draggedMessageElement = null;
    touchStartX = 0;
    touchStartY = 0;
    touchCurrentX = 0;
});

// Prevent issues if touchcancel occurs (e.g., alert shown during drag)
messages.addEventListener('touchcancel', (e) => {
    if (draggedMessageElement) {
        draggedMessageElement.style.transform = 'translateX(0)';
        draggedMessageElement.classList.remove('drag-active');
        draggedMessageElement.querySelector('.reply-swipe-indicator').style.width = '0';
    }
    isDragging = false;
    draggedMessageElement = null;
    touchStartX = 0;
    touchStartY = 0;
    touchCurrentX = 0;
});

// --- Utility Functions ---
function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}