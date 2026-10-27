// Typical nutrition for common Singapore dishes and drinks, one standard
// serving each. Values are approximate, rounded from widely published local
// figures (e.g. Health Promotion Board dish data); portions vary by stall, so
// the review screen lets the user edit and scale them.

import type { Nutrients } from "./nutrition.ts";

export interface Dish {
  name: string;
  portion: string;
  category: "rice" | "noodles" | "breads & snacks" | "drinks" | "fruit & sides";
  nutrients: Nutrients;
}

type Row = [
  name: string,
  portion: string,
  category: Dish["category"],
  kcal: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  fiberG: number,
  sugarG: number,
  sodiumMg: number,
];

// Saturated fat is rarely published per dish; hawker cooking (lard, coconut,
// palm oil) puts it at roughly a third of total fat, so it's derived.
const SAT_FAT_SHARE = 0.35;

const ROWS: Row[] = [
  // Rice
  ["Chicken rice (roasted/steamed)", "1 plate", "rice", 607, 25, 75, 23, 1, 2, 1290],
  ["Duck rice", "1 plate", "rice", 673, 27, 80, 26, 1, 4, 1640],
  ["Nasi lemak (egg, ikan bilis, peanuts)", "1 plate", "rice", 494, 13, 60, 23, 3, 6, 800],
  ["Nasi lemak with fried chicken wing", "1 plate", "rice", 800, 30, 70, 44, 3, 6, 1200],
  ["Nasi briyani (chicken)", "1 plate", "rice", 877, 34, 99, 37, 3, 6, 1800],
  ["Economy rice (1 meat, 2 veg)", "1 plate", "rice", 700, 30, 85, 25, 4, 6, 1600],
  ["Economy rice (2 veg, 1 egg) - lighter", "1 plate", "rice", 520, 18, 80, 15, 5, 5, 1300],
  ["Nasi goreng", "1 plate", "rice", 640, 20, 80, 26, 2, 6, 1700],
  ["Egg fried rice", "1 plate", "rice", 610, 17, 85, 22, 2, 2, 1400],
  ["Fish porridge", "1 bowl", "rice", 300, 20, 40, 6, 1, 1, 1500],
  ["Bak kut teh with rice", "1 bowl + rice", "rice", 600, 32, 75, 20, 1, 2, 1700],
  ["Hainanese curry rice (pork chop)", "1 plate", "rice", 800, 30, 90, 35, 3, 6, 1800],
  ["Plain white rice", "1 bowl (~200 g)", "rice", 260, 5, 57, 0.5, 1, 0, 0],
  ["Brown rice", "1 bowl (~200 g)", "rice", 250, 5, 52, 2, 3.5, 0, 0],

  // Noodles
  ["Char kway teow", "1 plate", "noodles", 744, 23, 76, 38, 2, 6, 1460],
  ["Laksa", "1 bowl", "noodles", 589, 22, 55, 32, 3, 4, 2600],
  ["Hokkien prawn mee", "1 plate", "noodles", 617, 21, 69, 29, 2, 3, 1400],
  ["Bak chor mee (dry)", "1 bowl", "noodles", 511, 23, 58, 20, 2, 4, 1700],
  ["Wanton mee (dry)", "1 plate", "noodles", 409, 15, 58, 12, 2, 4, 1400],
  ["Fishball noodles (soup)", "1 bowl", "noodles", 330, 18, 45, 8, 2, 2, 1900],
  ["Fish soup bee hoon (sliced fish)", "1 bowl", "noodles", 350, 26, 38, 9, 2, 2, 1900],
  ["Fish soup with milk & fried fish", "1 bowl", "noodles", 550, 28, 45, 27, 2, 5, 2000],
  ["Ban mian (soup)", "1 bowl", "noodles", 475, 22, 60, 15, 2, 2, 2000],
  ["Mee rebus", "1 bowl", "noodles", 556, 19, 82, 17, 4, 10, 2500],
  ["Mee siam", "1 plate", "noodles", 521, 19, 77, 16, 3, 12, 2600],
  ["Mee goreng (mamak)", "1 plate", "noodles", 660, 20, 85, 27, 3, 8, 1900],
  ["Yong tau foo (6 pcs, soup, with noodles)", "1 bowl", "noodles", 450, 22, 55, 14, 4, 4, 2400],
  ["Lor mee", "1 bowl", "noodles", 590, 25, 80, 18, 2, 6, 2300],

  // Breads & snacks
  ["Roti prata (plain)", "1 piece", "breads & snacks", 209, 4, 25, 10, 1, 1, 300],
  ["Roti prata (egg)", "1 piece", "breads & snacks", 265, 8, 26, 14, 1, 1, 380],
  ["Thosai (plain)", "1 piece", "breads & snacks", 180, 4, 30, 5, 1, 0, 250],
  ["Chapati", "1 piece", "breads & snacks", 120, 3, 18, 4, 2, 0, 150],
  ["Fried carrot cake (white)", "1 plate", "breads & snacks", 540, 11, 60, 29, 2, 2, 1400],
  ["Oyster omelette", "1 plate", "breads & snacks", 600, 22, 40, 39, 1, 2, 1300],
  ["Kaya toast", "2 slices", "breads & snacks", 300, 6, 38, 14, 1, 14, 350],
  ["Soft-boiled eggs", "2 eggs", "breads & snacks", 140, 12, 1, 10, 0, 0, 140],
  ["Chicken satay with peanut sauce", "10 sticks", "breads & snacks", 530, 40, 25, 30, 3, 14, 1100],
  ["Popiah", "1 roll", "breads & snacks", 188, 6, 28, 6, 3, 6, 600],
  ["Curry puff", "1 piece", "breads & snacks", 250, 5, 25, 15, 1, 2, 300],
  ["Chee cheong fun", "1 plate", "breads & snacks", 300, 6, 50, 8, 1, 10, 700],
  ["Siew mai", "4 pieces", "breads & snacks", 200, 12, 12, 12, 0.5, 1, 600],
  ["Har gow", "4 pieces", "breads & snacks", 160, 8, 20, 5, 0.5, 0, 450],
  ["Char siew bao", "1 bun", "breads & snacks", 240, 8, 38, 6, 1, 10, 400],
  ["Ondeh ondeh", "4 pieces", "breads & snacks", 200, 2, 38, 5, 1, 16, 50],

  // Drinks
  ["Kopi (condensed milk + sugar)", "1 cup", "drinks", 125, 2, 20, 4, 0, 19, 40],
  ["Kopi siew dai (less sugar)", "1 cup", "drinks", 90, 2, 14, 3, 0, 12, 30],
  ["Kopi-O (black, sugar)", "1 cup", "drinks", 60, 0, 15, 0, 0, 15, 5],
  ["Kopi-O kosong (black, no sugar)", "1 cup", "drinks", 5, 0.3, 0, 0, 0, 0, 5],
  ["Kopi-C (evaporated milk + sugar)", "1 cup", "drinks", 100, 2, 17, 3, 0, 16, 40],
  ["Teh tarik", "1 cup", "drinks", 150, 3, 24, 5, 0, 23, 50],
  ["Milo (kopitiam)", "1 cup", "drinks", 180, 5, 30, 5, 1, 26, 90],
  ["Iced lemon tea", "1 cup (~350 ml)", "drinks", 140, 0, 35, 0, 0, 34, 10],
  ["Bubble tea, 50% sugar, with pearls", "500 ml", "drinks", 350, 3, 65, 9, 0.5, 40, 80],
  ["Bubble tea, 0% sugar, no toppings", "500 ml", "drinks", 120, 3, 10, 7, 0, 8, 70],
  ["Sugarcane juice", "1 cup (~300 ml)", "drinks", 210, 0, 53, 0, 0, 50, 20],
  ["Soft drink (can)", "330 ml", "drinks", 140, 0, 35, 0, 0, 35, 30],

  // Fruit & sides
  ["Banana", "1 medium", "fruit & sides", 105, 1.3, 27, 0.4, 3, 14, 1],
  ["Apple", "1 medium", "fruit & sides", 95, 0.5, 25, 0.3, 4.4, 19, 2],
  ["Papaya", "1 cup cubed", "fruit & sides", 60, 0.7, 15, 0.4, 2.5, 11, 10],
  ["Watermelon", "1 slice (~280 g)", "fruit & sides", 85, 1.7, 21, 0.4, 1.1, 17, 3],
  ["Boiled egg", "1 egg", "fruit & sides", 70, 6, 0.5, 5, 0, 0.5, 60],
  ["Stir-fried vegetables (hawker)", "1 plate", "fruit & sides", 150, 4, 10, 11, 4, 4, 700],
];

export const DISHES: Dish[] = ROWS.map(([name, portion, category, calories, proteinG, carbsG, fatG, fiberG, sugarG, sodiumMg]) => ({
  name,
  portion,
  category,
  nutrients: {
    calories,
    proteinG,
    carbsG,
    fatG,
    fiberG,
    sugarG,
    sodiumMg,
    saturatedFatG: Math.round(fatG * SAT_FAT_SHARE * 10) / 10,
  },
}));

/** Case-insensitive match on every word of the query, in any order. */
export function searchDishes(query: string): Dish[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return DISHES;
  return DISHES.filter((d) => {
    const hay = `${d.name} ${d.category}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
