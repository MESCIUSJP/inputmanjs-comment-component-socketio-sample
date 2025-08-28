const express = require("express");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { Server } = require("socket.io");
const multer = require("multer");
const upload = multer();

const app = express();
app.use("/assets", express.static("node_modules/socket.io/client-dist"));
const server = createServer(app);
const io = new Server(server);

// モックデータ（本番環境ではデータベースを使用）
const comments = [

    {
        id: "1",
        userId: "1",
        postTime: new Date(2024, 7, 23, 8, 1, 59),
        updateTime: new Date(2024, 7, 23, 8, 1, 59),
        parentCommentId: "",
        content: "新入社員の松沢と申します。どうぞよろしくお願いいたします。",
    },
    {
        id: "2",
        userId: "0",
        postTime: new Date(2024, 7, 23, 8, 1, 59),
        updateTime: new Date(2024, 7, 23, 8, 1, 59),
        parentCommentId: "1",
        content:
            "どうぞよろしくお願いいたします。",
    }
];

const users = [
    {
        id: "0",
        name: "森上 偉久馬",
        avatar:
            "https://demo.mescius.jp/inputmanjs/demos/ja/samples/comment/commentMode/threadMode/img/avatar1.png",
    },
    {
        id: "1",
        name: "葛城 孝史",
        avatar:
            "https://demo.mescius.jp/inputmanjs/demos/ja/samples/comment/commentMode/threadMode/img/avatar2.png",
    }
];

const reactions = [
    {
        userId: "0",
        commentId: "0",
        reactionChar: "👍",
    },
    {
        userId: "1",
        commentId: "0",
        reactionChar: "🔥",
    }
];

// User取得
function getUserInfo(userId) {
    return users.find((u) => u.id === userId);
}

// Comment削除
function deleteCommentAndChildren(commentId) {
    const index = comments.findIndex((c) => c.id === commentId);
    if (index >= 0) {
        comments.splice(index, 1);
        comments
            .filter((c) => c.parentCommentId === commentId)
            .forEach((childComment) => deleteCommentAndChildren(childComment.id));
    }
}

// Comment変更を送信者以外にのみ通知します
function sendCommentChange(socketId, info) {
    const socket = io.sockets.sockets.get(socketId);
    socket.broadcast.emit("commentupdated", info);
}

// Reaction変更を送信者以外にのみ通知します
function sendReactionChange(socketId, info) {
    const socket = io.sockets.sockets.get(socketId);
    socket.broadcast.emit("reactionupdated", info);
}

function getReactionInfo(commentId, curUserId) {
    const reactionMap = new Map();

    reactions.forEach((reaction) => {
        if (reaction.commentId === commentId) {
            if (!reactionMap.has(reaction.reactionChar)) {
                reactionMap.set(reaction.reactionChar, {
                    reactionChar: reaction.reactionChar,
                    count: 0,
                    currentUserReacted: false,
                });
            }
            const reactionInfo = reactionMap.get(reaction.reactionChar);
            reactionInfo.count++;
            if (reaction.userId === curUserId) {
                reactionInfo.currentUserReacted = true;
            }
        }
    });

    return Array.from(reactionMap.values());
}

// comment
function commentResponse(req, res) {
    const method = req.method;
    if (method === "GET") {
        res.json({
            hasMore: false,
            comments: comments,
        });
    } else if (method === "POST") {
        const { content, userId, parentId, socketId } = req.body;
        const now = new Date();
        const newComment = {
            id: new Date().getTime().toString(),
            userId: userId,
            postTime: now,
            updateTime: now,
            parentCommentId: parentId,
            content: content,
        };
        comments.push(newComment);
        res.json(newComment);
        // Comment変更を送信者以外にのみ通知します
        sendCommentChange(socketId, {
            type: "add",
            comment: {
                id: newComment.id,
                userInfo: getUserInfo(newComment.userId),
                content: newComment.content,
                postTime: newComment.postTime,
                updateTime: newComment.updateTime,
                parentCommentId: newComment.parentCommentId,
            },
        });
    } else if (method === "PUT") {
        const { id, content, newContent, socketId } = req.body;
        const comment = comments.find((c) => c.id === id);
        if (comment) {
            comment.content = newContent || content;
            comment.updateTime = new Date();
        }
        res.json(comment);
        // Comment変更を送信者以外にのみ通知します
        sendCommentChange(socketId, {
            type: "update",
            comment: {
                id: comment.id,
                content: comment.content,
                updateTime: comment.updateTime,
            },
        });
    } else if (method === "DELETE") {
        const id = req.query.commentId;
        const socketId = req.query.socketId;
        deleteCommentAndChildren(id);
        res.end();
        // Comment変更を送信者以外にのみ通知します
        sendCommentChange(socketId, {
            type: "delete",
            comment: {
                id: id,
            },
        });
    }
}

// reaction
function reactionResponse(req, res) {
    const method = req.method;
    if (method === "GET") {
        const commentId = req.query.commentId;
        const userId = req.query.userId;
        const reactionMap = new Map();
        reactions.forEach((reaction) => {
            if (reaction.commentId === commentId) {
                if (!reactionMap.has(reaction.reactionChar)) {
                    reactionMap.set(reaction.reactionChar, {
                        reactionChar: reaction.reactionChar,
                        count: 0,
                        currentUserReacted: false,
                    });
                }

                const reactionInfo = reactionMap.get(reaction.reactionChar);
                reactionInfo.count += 1;
                if (reaction.userId === userId) {
                    reactionInfo.currentUserReacted = true;
                }
            }
        });
        res.json(Array.from(reactionMap.values()));
    } else if (method === "POST") {
        const { userId, commentId, reactChar, socketId } = req.body;
        reactions.push({
            userId: userId,
            commentId: commentId,
            reactionChar: reactChar,
        });
        res.send(true);
        // Reaction変更を送信者以外にのみ通知します
        sendReactionChange(socketId, {
            commentId,
            reactionInfo: getReactionInfo(commentId, userId),
        });
    } else if (method === "DELETE") {

        const userId = req.query.userId;
        const commentId = req.query.commentId;
        const reactChar = req.query.reactChar;
        const socketId = req.query.socketId;
        const index = reactions.findIndex(
            (c) =>
                c.userId === userId &&
                c.commentId === commentId &&
                c.reactionChar === reactChar
        );
        if (index !== -1) {
            reactions.splice(index, 1);
        }
        res.send(true);
        // Reaction変更を送信者以外にのみ通知します
        sendReactionChange(socketId, {
            commentId,
            reactionInfo: getReactionInfo(commentId, userId),
        });
    }
    res.end();
}

// User
function userResponse(req, res) {
    const method = req.method;
    const { filterText, id } = req.query;
    if (method === "GET") {
        if (id) {
            res.json(users.find((u) => u.id === id));
        } else if (filterText) {
            res.json(users.filter((u) => u.name.includes(filterText)));
        }
    }
    res.end();
}

//クライアント用ファイルを開く
app.get("/", (req, res) => {
    res.sendFile(join(__dirname, "index.html"));
});
// 3005ポートでサーバを起動
server.listen(3005, () => {
    console.log("server running at http://localhost:3005");
});

app.all("/comments", upload.none(), (req, res) => {
    commentResponse(req, res);
});
app.all("/users", upload.none(), (req, res) => {
    userResponse(req, res);
});
app.all("/reactions", upload.none(), (req, res) => {
    reactionResponse(req, res);
});