// Fixed opening level — every new game starts here, always the
// same layout (unlike every floor after it, which is procedurally
// generated — see world/levelLoader.js's loadProceduralLevel() and
// world/movement.js's descendLevel()). Built by hand as a plain
// adjacency layout (scripts/gen_level01.js), not typed wall-by-wall,
// to keep every connection symmetric between neighboring cells.
//
// Layout: the party starts at the bottom of a short straight hallway
// (x=2, running north from y=6 to y=0) facing north/away from the
// door they just walked through — that door is the 'door' feature on
// their own starting cell's south wall, only visible if they turn
// around. Walking straight forward the whole way (no turns needed)
// leads directly to a small stairs room at the top. Two small 2x2
// rooms branch off the hallway partway along (west off (2,4), east
// off (2,3)) as optional detours — a monster and a couple of potions
// for whoever wanders off the direct path — entirely skippable.
export const LEVEL01 = {
  "id": "level01-fixed",
  "width": 5,
  "height": 7,
  "start": {
    "x": 2,
    "y": 6,
    "facing": "N"
  },
  "tiles": [
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": false,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": false,
        "S": false,
        "W": false
      },
      "features": [
        "stairsDown"
      ]
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": false
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": false,
        "E": true,
        "S": false,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": false,
        "E": true,
        "S": false,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": false,
        "S": false,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": false,
        "W": false
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": false,
        "E": false,
        "S": false,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": false,
        "E": false,
        "S": true,
        "W": false
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": false,
        "E": true,
        "S": true,
        "W": false
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": false,
        "S": false,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": false,
        "S": false,
        "W": false
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": false,
        "E": true,
        "S": false,
        "W": false
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": false,
        "E": false,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": false,
        "E": true,
        "S": true,
        "W": false
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": false,
        "E": true,
        "S": false,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": false,
        "E": true,
        "S": true,
        "W": true
      },
      "features": [
        "door"
      ]
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    },
    {
      "type": "floor",
      "walls": {
        "N": true,
        "E": true,
        "S": true,
        "W": true
      },
      "features": []
    }
  ],
  "exits": [
    {
      "at": [
        2,
        0
      ],
      "to": null,
      "type": "stairsDown"
    }
  ],
  "encounters": [
    {
      "at": [
        1,
        5
      ],
      "monsterGroup": "slime",
      "chance": 0.4
    }
  ],
  "items": [
    {
      "at": [
        0,
        5
      ],
      "itemId": "potion_minor_heal"
    },
    {
      "at": [
        4,
        3
      ],
      "itemId": "potion_minor_heal"
    }
  ]
};
