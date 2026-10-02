// mc/data.js — 游戏静态数据
window.GAME_DATA = {
  blocks: {
    "1":  { name: "草方块",  top: 0,  side: 1,  bottom: 2  },
    "2":  { name: "泥土",    top: 2,  side: 2,  bottom: 2  },
    "3":  { name: "石头",    top: 3,  side: 3,  bottom: 3  },
    "4":  { name: "橡木",    top: 5,  side: 4,  bottom: 5  },
    "5":  { name: "橡树叶",  top: 6,  side: 6,  bottom: 6  },
    "6":  { name: "沙子",    top: 7,  side: 7,  bottom: 7  },
    "7":  { name: "基岩",    top: 8,  side: 8,  bottom: 8  },
    "8":  { name: "木板",    top: 9,  side: 9,  bottom: 9  },
    "9":  { name: "砖块",    top: 10, side: 10, bottom: 10 },
    "10": { name: "雪块",    top: 11, side: 12, bottom: 2  },
    "11": { name: "砂岩",    top: 13, side: 14, bottom: 13 },
    "12": { name: "仙人掌",  top: 16, side: 15, bottom: 16 },
    "13": { name: "云杉木",  top: 18, side: 17, bottom: 18 },
    "14": { name: "云杉叶",  top: 19, side: 19, bottom: 19 },
    "15": { name: "冰",      top: 20, side: 20, bottom: 20 },
    "16": { name: "深板岩",  top: 26, side: 26, bottom: 26 },
    "17": { name: "煤矿石",  top: 21, side: 21, bottom: 21 },
    "18": { name: "铁矿石",  top: 22, side: 22, bottom: 22 },
    "19": { name: "金矿石",  top: 23, side: 23, bottom: 23 },
    "20": { name: "钻石矿石", top: 24, side: 24, bottom: 24 },
    "21": { name: "青金石矿石", top: 25, side: 25, bottom: 25 },
    "22": { name: "深板岩煤矿石", top: 27, side: 27, bottom: 27 },
    "23": { name: "深板岩铁矿石", top: 28, side: 28, bottom: 28 },
    "24": { name: "深板岩金矿石", top: 29, side: 29, bottom: 29 },
    "25": { name: "深板岩钻石矿石", top: 30, side: 30, bottom: 30 },
    "26": { name: "深板岩青金石矿石", top: 31, side: 31, bottom: 31 }
  },
  recipes: [
    { result: 8, count: 4, ingredients: { 4: 1 } },
    { result: 9, count: 4, ingredients: { 2: 1, 3: 1 } },
    { result: 3, count: 1, ingredients: { 2: 4 } }
  ],
  biomes: [
    { id: 0, name: "平原", color: "#8fd94f" },
    { id: 1, name: "森林", color: "#3f9e3a" },
    { id: 2, name: "沙漠", color: "#e8d47a" },
    { id: 3, name: "雪原", color: "#bfe6ff" },
    { id: 4, name: "山地", color: "#b8b8b8" }
  ]
};
