/*************
**  CONFIG  **
*************/
const PORT = 3002;

/*******************************
**  NOT CONFIG - LEAVE ALONE  **
*******************************/
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const fs = require("fs");
const http = require("http");
const { Server: IOServer } = require("socket.io");

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.disable("x-powered-by");

//app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Load Routers
const routers = fs.readdirSync(path.resolve(__dirname, "./routes"))
.filter(r => r.endsWith(".js"))
.map(f => f.slice(0, -3));

for (let route of routers) {
  const router = require(path.resolve(__dirname, "./routes", route));
  if (route == "root") route = "";
  app.use(`/${route}`, router);
}

// Default to Static
app.use(express.static(path.join(__dirname, 'public')));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

const server = http.createServer(app);
const io = new IOServer(server);

app.set("port", PORT);
server.on("listening", () => {
  console.log("Listening on", PORT);
});
server.listen(PORT);

const { Player, Roll5 } = require("./classes");

const games = new Map();
let playerCount = 0;

io.on("connection", (socket) => {
  const playerName = `Player ${++playerCount}`;
  socket.emit("ready", { id: socket.id, name: playerName });

  // Player Join
  socket.on("join", (room) => {
    socket.join(room);
    const player = new Player({ name: playerName, id: socket.id });
    if (!games.has(room)) games.set(room, new Roll5({ players: [ player ] }));
    else games.get(room).players.push(player);
    io.to(room).emit("gameUpdate", games.get(room));
  });

  // Player Roll
  socket.on("roll", (room) => {
    const game = games.get(room);
    if (!game) {
      io.to(socket.id).emit("error", new Error("Room does not exist"));
      return;
    }

    if (game.currentPlayer == socket.id) game.roll();
    io.to(room).emit("gameUpdate", game);
  });

  // Lock/Unlock Die
  socket.on("toggleDie", (room, die) => {
    const game = games.get(room);
    if (!game) {
      io.to(socket.id).emit("error", new Error("Room does not exist"));
      return;
    }

    if (game.currentPlayer == socket.id) {
      game.dice[die].toggle();
      io.to(room).emit("gameUpdate", game);
    }
  });

  // Score
  socket.on("score", (room, box) => {
    const game = games.get(room);
    if (!game) {
      io.to(socket.id).emit("error", new Error("Room does not exist"));
      return;
    }

    if (game.currentPlayer == socket.id) {
      game.score(box);
      io.to(room).emit("gameUpdate", game);
    }
  });

  // Player Leave
  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (games.has(room)) {
        const game = games.get(room);
        const player = game.players.find(({ id }) => id == socket.id);
        game.players = game.players.filter(p => p.id != socket.id);

        if (game.players.length == 0) {
          games.delete(room);
          return;
        }

        if (game.currentPlayer == socket.id) {
          const eligible = game.players.filter(({ empty }) => empty > 0);

          if (eligible.length == 0) {
            game.currentPlayer = null;
          } else {
            const index = eligible.indexOf(player);
            game.currentPlayer = eligible[(index + 1) % eligible.length].id;
          }

          game.rolls = 0;
        }

        io.to(room).emit("gameUpdate", game);
      }
    }
  });
});

module.exports = {
  app,
  io,
  server,
};
