const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    // Enable connection state recovery for better client reconnection handling
    connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
        skipMiddlewares: true,
    },
});

const PORT = process.env.PORT || 3000;

// Store active users with their socket ID, username, and color
const activeUsers = new Map(); // socket.id -> { username, color }
const usernamesInUse = new Set(); // username -> true
const messages = []; // Stores all chat messages

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    let currentUsername = null;
    let currentUserColor = null;

    // Check if this is a recovered session
    if (socket.recovered) {
        // Find the user by their previous socket ID (might need a more robust lookup if IDs aren't persistent across all scenarios)
        // For this simple example, we'll assume the client will re-send their username/color on connect if recovered is true,
        // or we can attach properties to the socket on the first connection.
        // For a true recovered state, you'd store more on `socket` itself.
        // For now, we rely on the client's `set username and color` call, even if recovered.
        console.log(`Socket ${socket.id} recovered from a previous session.`);
    }

    // Emit current active user list to the newly connected user
    // This is crucial for the mention system to suggest users
    socket.emit('active users list', Array.from(activeUsers.values()));

    socket.on('set username and color', (data, callback) => {
        const { username, color } = data;

        if (!username || typeof username !== 'string' || username.trim() === '') {
            return callback({ success: false, message: 'Invalid username.' });
        }
        if (!color || typeof color !== 'string' || !/^#[0-9A-F]{6}$/i.test(color)) {
            return callback({ success: false, message: 'Invalid color code.' });
        }

        const trimmedUsername = username.trim();

        // Check if username is already in use by another active socket
        // We need to differentiate if the current socket already 'owns' this username
        if (usernamesInUse.has(trimmedUsername) && activeUsers.get(socket.id)?.username !== trimmedUsername) {
            callback({ success: false, message: 'Username is already taken.' });
            return;
        }

        // If the socket already has a username, remove the old entry
        if (currentUsername && usernamesInUse.has(currentUsername) && activeUsers.get(socket.id)?.username === currentUsername) {
            usernamesInUse.delete(currentUsername);
            activeUsers.delete(socket.id); // Remove old socket.id mapping if changing username
        }

        usernamesInUse.add(trimmedUsername);
        currentUsername = trimmedUsername;
        currentUserColor = color;

        activeUsers.set(socket.id, { username: currentUsername, color: currentUserColor, id: socket.id }); // Store socket ID for potential future use

        console.log(`User ${currentUsername} (${currentUserColor}) has joined/set their name.`);
        io.emit('user joined', { username: currentUsername, color: currentUserColor });
        // Emit updated active users list to everyone after a user joins/changes name
        io.emit('active users list', Array.from(activeUsers.values()));
        callback({ success: true, message: 'Username and color set successfully!' });

        io.to(socket.id).emit('past messages', messages);
    });

    socket.on('chat message', (data) => {
        if (currentUsername && currentUserColor) {
            const messageId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            const messageData = {
                id: messageId,
                user: currentUsername,
                color: currentUserColor,
                message: data.message,
                timestamp: Date.now(),
                replyToId: data.replyToId || null,
                replyToText: data.replyToText || null,
                replyToUser: data.replyToUser || null,
                mentions: data.mentions || []
            };
            messages.push(messageData);
            console.log(`Message from ${currentUsername}: ${messageData.message}`);
            io.emit('chat message', messageData);
        } else {
            socket.emit('error', 'Authentication required. Please set a username and color first!');
        }
    });

    socket.on('typing', () => {
        if (currentUsername) {
            socket.broadcast.emit('user typing', { username: currentUsername });
        }
    });

    socket.on('stop typing', () => {
        if (currentUsername) {
            socket.broadcast.emit('user stop typing', { username: currentUsername });
        }
    });

    socket.on('disconnect', (reason) => {
        console.log(`Socket ${socket.id} disconnected. Reason: ${reason}`);
        // Only remove user if the session is not recovered or if it's a hard disconnect
        if (!socket.recovered && currentUsername) {
            usernamesInUse.delete(currentUsername);
            activeUsers.delete(socket.id);
            console.log(`User ${currentUsername} disconnected and removed.`);
            io.emit('user left', currentUsername);
            // Emit updated active users list to everyone after a user leaves
            io.emit('active users list', Array.from(activeUsers.values()));
            io.emit('user stop typing', { username: currentUsername });
        } else if (currentUsername) {
             console.log(`User ${currentUsername} temporarily disconnected (session might recover).`);
             // Still send stop typing in case recovery fails or takes time
             io.emit('user stop typing', { username: currentUsername });
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});