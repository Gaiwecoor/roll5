const { nanoid } = require("nanoid");

function checkBoxValue(box) {
  if (!Boxes.includes(box)) throw new RangeError(`"${box}" is not a valid score box.`);
}

function checkIsNumber(value) {
  if (isNaN(value)) throw new TypeError(`"${value}" is not a valid score.`);
}

const Boxes = [
  "s1", "s2", "s3", "s4", "s5", "s6",
  "k3", "k4", "fh", "ss", "ls", "k5", "ch"
];

class Die {
  constructor(data = {}) {
    this.value = data?.value || Math.ceil(Math.random() * 6);
    this.locked = data?.locked || false;
  }

  roll() {
    if (!this.locked) this.value = Math.ceil(Math.random() * 6);
    return this;
  }

  toggle() {
    this.locked = !this.locked;
    return this;
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

  roll() {
    for (const die of this) {
      die.roll();
    }
    return this;
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

class Player {
  constructor({ name = "", id = null, score = {} }) {
    this.name = name || nanoid();
    this.id = id || nanoid();
    this.score = new Score(score);
  }

  get empty() {
    return Boxes.reduce((a, box) => a + (this.score[box] === null ? 1 : 0), 0);
  }

  reset() {
    this.score = new Score();
    return this;
  }

  tally(box, dice) {
    box = box.toLowerCase();
    checkBoxValue(box);

    if (this.score[box] !== null) throw new Error(`The "${box}" box is already scored.`);

    // Bonus k5
    if ((this.score.k5 !== null) && (dice.values.k5 !== 0)) {
      if (this.score.k5 !== 0) this.score.b5 += 100;

      const group = dice.sum() / 5;

      const topFull = this.score["s" + group] !== null;
      const ksFull = (this.score.k3 !== null) && (this.score.k4 !== null);

      if (topFull && ksFull && ["ss", "ls"].includes(box)) {
        switch (box) {
          case "ss":
            this.score.set(box, 30);
            break;
          case "ls":
            this.score.set(box, 40);
            break;
          default:
            this.score.set(box, dice.values[box]);
        }
      }

      this.score.set(box, dice.values[box]);
      return this;
    }

    this.score.set(box, dice.values[box]);
  }
}

class Roll5 {
  constructor(data = {}) {
    this.players = data?.players || [];
    this.currentPlayer = data?.currentPlayer || this.players[0]?.id || null;
    this.dice = new DiceSet(data?.dice);
    this.rolls = data?.rolls || 1;
    this.id = data?.id || nanoid();
  }

  roll() {
    if (this.rolls == 0) {
      for (const die of this.dice) die.locked = false;
    }
    if (this.rolls < 3) {
      this.dice.roll();
      this.rolls++;
    }
    return this;
  }

  score(box) {
    if (this.rolls == 0) return this;

    const player = this.players.find(({ id }) => id == this.currentPlayer);
    player.tally(box, this.dice);

    const eligible = this.players.filter(({ empty }) => empty > 0);

    if (eligible.length == 0) {
      this.currentPlayer = null;
    } else {
      const index = eligible.indexOf(player);
      this.currentPlayer = eligible[(index + 1) % eligible.length].id;
    }

    this.rolls = 0;

    for (let i = 0; i < 5; i++) this.dice[i].locked = false;
    return this;
  }
}

class Score {
  constructor(data = {}) {
    for (const box of Boxes) {
      this[box] = data?.[box] || null;
    }
    this.b5 = data?.b5 ?? 0;
  }

  get bonus() {
    return (this.sub1 >= 63 ? 35 : 0);
  }

  set(box, value) {
    box = box.toLowerCase();
    value = parseInt(value, 10);
    checkBoxValue(box);
    checkIsNumber(value);

    this[box] = value;

    return this;
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

module.exports = {
  Boxes,
  Die,
  DiceSet,
  Player,
  Roll5,
  Score,
};
