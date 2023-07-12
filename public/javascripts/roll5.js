class Die {
  constructor(data = {}) {
    this.value = data?.value || 0;
    this.locked = data?.locked || false;
  }

  toString() {
    return this.value.toString();
  }

  valueOf() {
    return this.value;
  }
}

class DiceSet extends Array {
  constructor(data) {
    super(5);
    for (let i = 0; i < 5; i++) {
      this[i] = new Die(data?.[i]);
    }
  }

  count(n) {
    if (!n) throw new RangeError("Must provide a value between 1 and 6.");
    return this.reduce((a, c) => a + (c == n ? 1 : 0), 0);
  }

  straight(large = false) {
    if (large) {
      if (
        (this.count(2) == 1) &&
        (this.count(3) == 1) &&
        (this.count(4) == 1) &&
        (this.count(5) == 1) &&
        ((this.count(1) == 1) || (this.count(6) == 1))
      ) {
        return true;
      }
    } else {
      if (
        (this.count(3) >= 1) &&
        (this.count(4) >= 1) &&
        (
          ((this.count(1) >= 1) && (this.count(2) >= 1)) ||
          ((this.count(2) >= 1) && (this.count(5) >= 1)) ||
          ((this.count(5) >= 1) && (this.count(6) >= 1))
        )
      ) {
        return true;
      }
    }

    return false;
  }

  sum(n) {
    if (n == undefined) return this.reduce((a, c) => a + c, 0);
    return this.reduce((a, c) => a + (c == n ? c : 0), 0);
  }

  get values() {
    return {
      s1: this.sum(1),
      s2: this.sum(2),
      s3: this.sum(3),
      s4: this.sum(4),
      s5: this.sum(5),
      s6: this.sum(6),

      k3: [1, 2, 3, 4, 5, 6].map(n => this.count(n)).some(c => c >= 3) ? this.sum() : 0,
      k4: [1, 2, 3, 4, 5, 6].map(n => this.count(n)).some(c => c >= 4) ? this.sum() : 0,

      fh: [1, 2, 3, 4, 5, 6].map(n => this.count(n)).some(c => c == 1) ? 0 : 25,

      ss: this.straight(false) ? 30 : 0,
      ls: this.straight(true) ? 40 : 0,

      k5: [1, 2, 3, 4, 5, 6].map(n => this.count(n)).some(c => c == 5) ? 50 : 0,
      ch: this.sum(),
    };
  }
}

class Score {
  constructor(data) {
    for (const box of Object.keys(data)) {
      this[box] = data?.[box] ?? null;
    }
  }

  get bonus() {
    return (this.sub1 >= 63 ? 35 : 0);
  }

  get sub1() {
    return (
      (this.s1 || 0) + (this.s2 || 0) + (this.s3 || 0) +
      (this.s4 || 0) + (this.s5 || 0) + (this.s6 || 0)
    );
  }

  get sub2() {
    return (
      (this.k3 || 0) + (this.k4 || 0) + (this.fh || 0) +
      (this.ss || 0) + (this.ls || 0) +
      (this.k5 || 0) + (this.ch || 0)
    )
  }

  get total() {
    return this.sub1 + this.sub2 + this.bonus + this.b5;
  }
}

let myId, gameState;

function button({ id, key }) {
  if ((gameState.currentPlayer !== myId) || (id !== myId) || (gameState.rolls == 0)) return "";
  return `<button class="pure-button pure-button-primary score" data-box="${key}">${gameState.dice.values[key]}</button>`;
}

$(document).ready(() => {
  const socket = io();
  const room = "default";

  /***********************
  ** Socket Shenanigans **
  ***********************/

  socket.on("ready", (player) => {
    myId = player.id;
    $("#playerName").html(player.name);
    socket.emit("join", room);
  });

  socket.on("gameUpdate", game => {
    game.dice = new DiceSet(game.dice);
    for (const player of game.players) {
      player.score = new Score(player.score);
    }
    gameState = game;
    // Display Dice
    for (let i = 0; i < 5; i++) {
      $(`#d${i}`).removeClass(["d1", "d2", "d3", "d4", "d5", "d6", "locked"]);
      if (game.dice[i].value != 0) $(`#d${i}`).addClass(`d${game.dice[i]}`);
      if (game.dice[i].locked) $(`#d${i}`).addClass("locked");
    }

    if ((game.currentPlayer == myId) && (game.rolls < 3)) {
      $("#roll").removeClass("pure-button-disabled");
    } else {
      $("#roll").addClass("pure-button-disabled");
    }
    $("#rollsRemaining").html(3 - game.rolls);

    // Display Scores
    const players = game.players;
    const labels = { s1: "1s", s2: "2s", s3: "3s", s4: "4s", s5: "5s", s6: "6s", sub1: "Subtotal", bonus: "Bonus", k3: "3K", k4: "4K", fh: "FH", ss: "SS", ls: "LS", k5: "5K", b5: "5K+", ch: "Chance", sub2: "Subtotal", total: "Total" };
    $("#scoreTable").empty().append(
      `<thead><tr><th></th>${players.map(({ name }) => `<th>${name}</th>`)}</tr></thead>` +
      "<tbody>" +
      Object.entries(labels).map(([ key, label ]) => `<tr><th>${label}</th>${players.map(({ id, score }) => `<td>${score[key] ?? button({ id, key })}</td>`)}</tr>`) +
      "</tbody>"
    );

    if (game.currentPlayer == myId) {
      $(".score").on("click", ({ target }) => {
        socket.emit("score", room, $(target)[0].dataset.box);
      });
    }
  });

  socket.on("error", error => {
    console.error(error);
  });

  /*********************
  ** INTERFACE CLIKKA **
  *********************/

  $(".d").on("click", ({ target }) => {
    if ((gameState.currentPlayer != myId) || (gameState.rolls == 0)) return;
    const dieId = parseInt($(target)[0].id[1], 10);
    socket.emit("toggleDie", room, dieId);
  });

  $("#roll").on("click", () => {
    if ((gameState.currentPlayer != myId) || (gameState.rolls == 3)) return;
    socket.emit("roll", room);
  });
});
