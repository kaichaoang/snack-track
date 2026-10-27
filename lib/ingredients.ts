// Building blocks for free-text meal descriptions ("grouper fish soup with
// less rice, a little sauce"). Each ingredient has a default portion and
// typical cooked values for it, rounded from common food-composition data
// (USDA FoodData Central / Singapore HPB). Composites expand a dish into
// ingredients so later words like "less rice" or "some soup" can adjust a part.

import type { Nutrients } from "./nutrition.ts";

export interface Ingredient {
  id: string;
  name: string;
  /** Default portion, e.g. "1 bowl (~200 g)". */
  portion: string;
  /** Grams (or ml) in the default portion, for "150g chicken". */
  grams: number;
  /** Pieces in the default portion, for "3 fishballs". */
  pieces?: number;
  /** Ingredients in the same group replace each other ("rice" after "chicken rice"). */
  group?: string;
  aliases: string[];
  nutrients: Nutrients;
}

export interface Composite {
  id: string;
  name: string;
  aliases: string[];
  parts: { id: string; factor: number }[];
}

type Row = [
  id: string,
  name: string,
  portion: string,
  grams: number,
  aliases: string[],
  values: [kcal: number, proteinG: number, carbsG: number, fatG: number, fiberG: number, sugarG: number, sodiumMg: number],
  extra?: { pieces?: number; group?: string; satShare?: number },
];

const ROWS: Row[] = [
  // Carbs
  ["rice", "White rice", "1 bowl (~200 g)", 200, ["rice", "white rice", "plain rice", "steamed rice"], [260, 5, 57, 0.5, 1, 0, 0], { group: "rice" }],
  ["brown_rice", "Brown rice", "1 bowl (~200 g)", 200, ["brown rice", "multigrain rice", "red rice"], [250, 5, 52, 2, 3.5, 0, 0], { group: "rice" }],
  ["oily_rice", "Chicken rice (rice only)", "1 plate (~200 g)", 200, ["chicken rice rice", "oily rice", "flavoured rice", "flavored rice"], [380, 6, 60, 13, 1, 0, 500], { group: "rice" }],
  ["porridge", "Plain porridge", "1 bowl (~300 g)", 300, ["porridge", "congee", "plain porridge"], [130, 2.5, 28, 0.3, 0.3, 0, 300], { group: "rice" }],
  ["bee_hoon", "Bee hoon (rice vermicelli)", "1 portion (~150 g cooked)", 150, ["bee hoon", "beehoon", "mee hoon", "vermicelli", "rice vermicelli"], [165, 3, 37, 0.3, 1, 0, 10], { group: "noodles" }],
  ["yellow_noodles", "Yellow noodles", "1 portion (~150 g cooked)", 150, ["noodles", "noodle", "yellow noodles", "mee", "mee kia", "egg noodles", "ramen", "ban mian", "mian"], [210, 7, 40, 2.5, 2, 0, 300], { group: "noodles" }],
  ["mee_pok", "Mee pok", "1 portion (~150 g cooked)", 150, ["mee pok"], [210, 7, 40, 2.5, 2, 0, 300], { group: "noodles" }],
  ["kway_teow", "Kway teow (flat rice noodles)", "1 portion (~150 g cooked)", 150, ["kway teow", "kuay teow", "hor fun", "pho", "flat noodles"], [210, 3, 48, 0.5, 1, 0, 30], { group: "noodles" }],
  ["udon", "Udon", "1 portion (~200 g cooked)", 200, ["udon"], [210, 5, 43, 0.8, 2, 0, 400], { group: "noodles" }],
  ["pasta", "Pasta", "1 plate (~200 g cooked)", 200, ["pasta", "spaghetti", "penne", "macaroni"], [315, 11, 62, 1.8, 3.6, 1, 5], { group: "noodles" }],
  ["bread", "White bread", "1 slice (~30 g)", 30, ["bread", "white bread", "toast", "slice of bread", "slices of bread"], [80, 2.5, 15, 1, 0.8, 1.5, 150], { pieces: 1, group: "bread" }],
  ["wholemeal", "Wholemeal bread", "1 slice (~30 g)", 30, ["wholemeal", "wholemeal bread", "wholemeal toast", "whole wheat bread", "whole wheat toast", "wholegrain bread", "multigrain bread"], [75, 3.5, 13, 1, 2, 1.5, 140], { pieces: 1, group: "bread" }],
  ["potato", "Potato (boiled/baked)", "1 medium (~150 g)", 150, ["potato", "potatoes", "baked potato", "mashed potato"], [130, 3, 30, 0.2, 3, 1, 10], { pieces: 1 }],
  ["fries", "French fries", "1 medium serving (~110 g)", 110, ["fries", "french fries", "chips"], [340, 4, 44, 16, 4, 0.3, 230]],
  ["sweet_potato", "Sweet potato", "1 medium (~150 g)", 150, ["sweet potato", "sweet potatoes"], [135, 2.5, 31, 0.2, 4.5, 9, 55], { pieces: 1 }],
  ["oats", "Oats (cooked with water)", "40 g dry", 40, ["oats", "oatmeal", "overnight oats"], [150, 5, 27, 2.7, 4, 0.5, 2]],
  ["wrap", "Tortilla wrap", "1 wrap (~60 g)", 60, ["wrap", "tortilla"], [180, 5, 30, 4.5, 2, 1, 400], { pieces: 1 }],

  // Protein
  ["fish", "Sliced fish (grouper, batang, snapper…)", "~100 g cooked", 100, ["fish", "sliced fish", "fish slices", "grouper", "garoupa", "batang", "snapper", "sea bass", "seabass", "threadfin", "toman", "dory", "cod", "tilapia", "pomfret", "steamed fish"], [110, 23, 0, 1.5, 0, 0, 60], { satShare: 0.25 }],
  ["fried_fish", "Fried fish", "~100 g", 100, ["fried fish", "fish and chips fish", "battered fish", "fish fillet fried"], [230, 20, 10, 12, 0.5, 0.5, 300], { satShare: 0.2 }],
  ["salmon", "Salmon", "~100 g cooked", 100, ["salmon"], [206, 22, 0, 12, 0, 0, 60], { satShare: 0.2 }],
  ["tuna", "Tuna (canned in water)", "1 small can (~100 g)", 100, ["tuna"], [115, 26, 0, 1, 0, 0, 300], { satShare: 0.3 }],
  ["prawns", "Prawns", "~100 g (6–8 prawns)", 100, ["prawn", "prawns", "shrimp", "shrimps"], [100, 24, 0.2, 0.3, 0, 0, 200], { pieces: 7, satShare: 0.3 }],
  ["sotong", "Squid (sotong)", "~100 g", 100, ["sotong", "squid", "calamari"], [90, 16, 3, 1.4, 0, 0, 250], { satShare: 0.3 }],
  ["chicken_breast", "Chicken breast", "~100 g cooked", 100, ["chicken breast", "breast", "grilled chicken", "chicken"], [165, 31, 0, 3.6, 0, 0, 74], { satShare: 0.3 }],
  ["chicken_thigh", "Chicken thigh (with skin)", "~100 g cooked", 100, ["chicken thigh", "thigh", "drumstick", "chicken leg", "chicken drumstick"], [230, 24, 0, 15, 0, 0, 90], { satShare: 0.3 }],
  ["chicken_rice_chicken", "Steamed/roasted chicken", "~100 g", 100, ["steamed chicken", "roast chicken", "roasted chicken", "white chicken", "soy sauce chicken"], [210, 25, 0, 12, 0, 0, 400], { satShare: 0.3 }],
  ["fried_chicken", "Fried chicken", "1 piece (~120 g)", 120, ["fried chicken", "chicken wing", "chicken wings", "karaage", "chicken cutlet", "crispy chicken"], [300, 25, 10, 18, 0.5, 0, 500], { pieces: 1, satShare: 0.28 }],
  ["pork", "Lean pork", "~100 g cooked", 100, ["pork", "lean pork", "pork slices", "sliced pork", "pork chop"], [190, 27, 0, 8, 0, 0, 60], { satShare: 0.35 }],
  ["minced_pork", "Minced pork", "~100 g cooked", 100, ["minced pork", "minced meat", "mince", "bak chor", "pork patty", "meatballs", "meatball"], [260, 22, 0, 19, 0, 0, 80], { satShare: 0.37 }],
  ["char_siew", "Char siew", "~100 g", 100, ["char siew", "char siu", "bbq pork"], [255, 20, 15, 13, 0, 12, 700], { satShare: 0.37 }],
  ["siew_yoke", "Roast pork (siew yoke)", "~100 g", 100, ["roast pork", "siew yoke", "siu yuk", "pork belly", "sio bak"], [380, 20, 1, 33, 0, 0, 600], { satShare: 0.37 }],
  ["beef", "Beef", "~100 g cooked", 100, ["beef", "steak", "beef slices", "sliced beef"], [220, 26, 0, 12, 0, 0, 60], { satShare: 0.4 }],
  ["mutton", "Mutton / lamb", "~100 g cooked", 100, ["mutton", "lamb"], [290, 25, 0, 21, 0, 0, 70], { satShare: 0.45 }],
  ["duck", "Roast/braised duck", "~100 g", 100, ["duck", "roast duck", "braised duck"], [340, 19, 0, 28, 0, 0, 500], { satShare: 0.33 }],
  ["egg", "Egg (boiled/poached/steamed)", "1 egg", 50, ["egg", "eggs", "boiled egg", "boiled eggs", "poached egg", "soft boiled egg", "soft-boiled egg", "steamed egg", "hard boiled egg"], [70, 6, 0.5, 5, 0, 0.5, 60], { pieces: 1, satShare: 0.33 }],
  ["fried_egg", "Fried egg", "1 egg", 50, ["fried egg", "fried eggs", "sunny side up", "omelette", "omelet", "scrambled egg", "scrambled eggs"], [90, 6, 0.4, 7, 0, 0.4, 95], { pieces: 1, satShare: 0.3 }],
  ["tofu", "Tofu", "~100 g", 100, ["tofu", "beancurd", "bean curd", "silken tofu", "egg tofu"], [145, 15, 3, 8.7, 2, 0.5, 10], { satShare: 0.15 }],
  ["fried_tofu", "Fried tofu / tau pok", "~100 g", 100, ["fried tofu", "tau pok", "taupok", "fried beancurd", "tau kwa"], [270, 17, 9, 20, 4, 1, 15], { satShare: 0.15 }],
  ["fishball", "Fishballs", "5 pieces (~75 g)", 75, ["fishball", "fishballs", "fish ball", "fish balls", "meatball soup balls"], [75, 9, 7, 1, 0, 1, 550], { pieces: 5, satShare: 0.3 }],
  ["fishcake", "Fishcake", "~50 g", 50, ["fishcake", "fish cake", "fish cakes", "ngoh hiang"], [75, 6, 6, 3, 0, 1, 400], { satShare: 0.3 }],
  ["cheese", "Cheese", "1 slice (~20 g)", 20, ["cheese", "cheese slice"], [65, 4, 1, 5, 0, 0.5, 250], { pieces: 1, satShare: 0.6 }],
  ["tempeh", "Tempeh", "~100 g", 100, ["tempeh"], [195, 20, 8, 11, 5, 0, 10], { satShare: 0.2 }],

  // Vegetables
  ["veg", "Vegetables (boiled/in soup)", "1 serving (~100 g)", 100, ["veg", "vege", "veggie", "veggies", "vegetable", "vegetables", "greens", "leafy greens", "xiao bai cai", "chye sim", "cai xin", "kailan", "kai lan", "bok choy", "spinach", "lettuce", "cabbage", "nai bai"], [25, 2, 4, 0.3, 2, 1.5, 30], { group: "veg", satShare: 0.2 }],
  ["stirfry_veg", "Stir-fried vegetables", "1 plate (~150 g)", 150, ["stir fried vegetables", "stir-fried vegetables", "stir fry veg", "fried vegetables", "fried veg", "stir fried veg", "garlic veg", "sambal kangkong", "kangkong"], [100, 3, 6, 7, 3, 2, 400], { group: "veg", satShare: 0.2 }],
  ["salad", "Salad greens", "1 bowl (~70 g)", 70, ["salad", "salad greens", "mixed greens", "rocket", "romaine"], [15, 1.2, 2.5, 0.2, 1.5, 1, 20]],
  ["broccoli", "Broccoli", "~100 g", 100, ["broccoli"], [35, 2.4, 7, 0.4, 3.3, 1.4, 40]],
  ["tomato", "Tomato", "1 medium", 120, ["tomato", "tomatoes", "cherry tomatoes"], [22, 1, 5, 0.2, 1.5, 3, 6], { pieces: 1 }],
  ["cucumber", "Cucumber", "~100 g", 100, ["cucumber"], [15, 0.7, 3.6, 0.1, 0.5, 1.7, 2]],
  ["bitter_gourd", "Bitter gourd", "~100 g", 100, ["bitter gourd"], [20, 1, 4, 0.2, 2, 1, 6]],
  ["mushroom", "Mushrooms", "~100 g", 100, ["mushroom", "mushrooms", "shiitake", "enoki"], [25, 3, 3.5, 0.3, 1, 2, 5]],
  ["bean_sprouts", "Bean sprouts", "~100 g", 100, ["bean sprouts", "taugeh", "tauge"], [30, 3, 6, 0.2, 1.8, 4, 6]],
  ["corn", "Corn", "~100 g", 100, ["corn", "sweet corn"], [96, 3.4, 21, 1.5, 2.4, 4.5, 1]],
  ["avocado", "Avocado", "½ avocado (~70 g)", 70, ["avocado"], [120, 1.5, 6, 11, 5, 0.5, 5], { satShare: 0.15 }],
  ["edamame", "Edamame", "~100 g", 100, ["edamame"], [120, 12, 9, 5, 5, 2, 6], { satShare: 0.15 }],
  ["pumpkin", "Pumpkin", "~100 g", 100, ["pumpkin"], [26, 1, 6.5, 0.1, 0.5, 2.8, 1]],

  // Soups and gravies
  ["broth", "Clear soup", "1 bowl (~300 ml)", 300, ["soup", "clear soup", "broth", "soup base"], [30, 3, 1, 1.5, 0, 0.5, 800], { group: "soup", satShare: 0.3 }],
  ["fish_broth", "Fish soup broth (clear)", "1 bowl (~300 ml)", 300, ["fish broth", "fish soup broth"], [30, 3, 1, 1.5, 0, 0, 900], { group: "soup", satShare: 0.3 }],
  ["milky_broth", "Milky fish soup broth", "1 bowl (~300 ml)", 300, ["milky soup", "milky broth", "milk soup", "evaporated milk soup"], [150, 5, 8, 10, 0, 7, 900], { group: "soup", satShare: 0.6 }],
  ["tom_yum", "Tom yum broth", "1 bowl (~300 ml)", 300, ["tom yum", "tom yam"], [70, 3, 6, 3.5, 1, 3, 1200], { group: "soup", satShare: 0.4 }],
  ["curry", "Curry gravy (coconut)", "½ cup (~120 ml)", 120, ["curry", "curry gravy", "curry sauce", "lemak"], [180, 2, 8, 16, 1, 3, 600], { group: "gravy", satShare: 0.8 }],
  ["sauce", "Sauce / gravy (soy, oyster, braising)", "2 tbsp", 30, ["sauce", "gravy", "dark sauce", "braising sauce", "lor"], [40, 1, 6, 1.5, 0, 4, 700], { group: "sauce", satShare: 0.2 }],

  // Condiments and fats
  ["soy_sauce", "Soy sauce", "1 tbsp", 15, ["soy sauce", "light soy", "kicap"], [10, 1, 1, 0, 0, 0.4, 900], { group: "sauce" }],
  ["chilli", "Chilli sauce / sambal", "1 tbsp", 15, ["chilli", "chili", "chilli sauce", "chili sauce", "sambal", "chilli paste"], [40, 0.5, 3, 3, 0.5, 2, 250], { satShare: 0.2 }],
  ["peanut_sauce", "Peanut sauce", "3 tbsp", 45, ["peanut sauce", "satay sauce"], [140, 5, 8, 10, 1.5, 5, 300], { satShare: 0.2 }],
  ["sweet_sauce", "Sweet sauce (hoisin, tim cheong)", "1 tbsp", 15, ["sweet sauce", "hoisin", "tim cheong", "teriyaki sauce", "bbq sauce"], [35, 0.5, 7, 0.5, 0, 5, 250]],
  ["dressing", "Creamy salad dressing", "2 tbsp", 30, ["dressing", "sesame dressing", "caesar dressing", "creamy dressing", "goma dressing", "thousand island"], [140, 0.5, 3, 14, 0, 2, 250], { satShare: 0.15 }],
  ["vinaigrette", "Vinaigrette", "2 tbsp", 30, ["vinaigrette", "balsamic", "olive oil dressing", "lemon dressing", "oriental dressing"], [90, 0, 3, 9, 0, 2, 150], { satShare: 0.15 }],
  ["mayo", "Mayonnaise", "1 tbsp", 14, ["mayo", "mayonnaise", "aioli"], [95, 0.1, 0.1, 10.3, 0, 0.1, 90], { satShare: 0.15 }],
  ["oil", "Cooking oil", "1 tbsp", 14, ["oil", "olive oil", "sesame oil", "shallot oil", "lard"], [120, 0, 0, 14, 0, 0, 0], { satShare: 0.2 }],
  ["fried_shallots", "Fried shallots / garlic", "1 tbsp", 8, ["fried shallots", "fried garlic", "shallots"], [45, 0.3, 3, 3.5, 0.3, 0.5, 5], { satShare: 0.3 }],
  ["butter", "Butter", "1 tbsp", 14, ["butter", "margarine"], [100, 0.1, 0, 11.5, 0, 0, 90], { satShare: 0.63 }],
  ["peanut_butter", "Peanut butter", "1 tbsp", 16, ["peanut butter"], [95, 3.5, 3.5, 8, 1, 1.5, 70], { satShare: 0.2 }],
  ["kaya", "Kaya", "1 tbsp", 20, ["kaya"], [70, 0.8, 11, 2.5, 0, 10, 15], { satShare: 0.6 }],
  ["ketchup", "Ketchup", "1 tbsp", 17, ["ketchup", "tomato sauce"], [20, 0.2, 5, 0, 0, 4, 150]],

  // Drinks and extras
  ["milk", "Milk (full cream)", "1 glass (250 ml)", 250, ["milk", "fresh milk", "full cream milk"], [150, 8, 12, 8, 0, 12, 105], { satShare: 0.6 }],
  ["low_fat_milk", "Low-fat milk", "1 glass (250 ml)", 250, ["low fat milk", "skim milk", "skimmed milk", "hi-lo milk"], [105, 8.5, 12.5, 2.5, 0, 12.5, 110], { satShare: 0.6 }],
  ["soy_milk", "Soy milk (sweetened)", "1 cup (250 ml)", 250, ["soy milk", "soya milk", "soya bean milk", "soybean milk"], [130, 7, 15, 4, 1, 12, 100], { satShare: 0.15 }],
  ["sugar", "Sugar", "1 tsp", 4, ["sugar", "honey", "syrup"], [16, 0, 4, 0, 0, 4, 0]],
  ["condensed_milk", "Condensed milk", "1 tbsp", 20, ["condensed milk"], [65, 1.6, 11, 1.7, 0, 11, 25], { satShare: 0.6 }],
  ["yogurt", "Greek yogurt (plain)", "1 cup (~170 g)", 170, ["yogurt", "yoghurt", "greek yogurt", "greek yoghurt"], [160, 16, 7, 7.5, 0, 6, 60], { satShare: 0.6 }],
  ["nuts", "Nuts", "1 handful (~30 g)", 30, ["nuts", "almonds", "cashews", "peanuts", "walnuts"], [175, 6, 6, 15, 3, 1.5, 2], { satShare: 0.12 }],
  ["ice_cream", "Ice cream", "1 scoop (~70 g)", 70, ["ice cream"], [140, 2.5, 16, 7.5, 0.5, 14, 55], { pieces: 1, satShare: 0.6 }],
  ["chocolate", "Chocolate", "1 small bar (~25 g)", 25, ["chocolate"], [135, 2, 15, 7.5, 1, 13, 20], { satShare: 0.6 }],
  ["beer", "Beer", "1 can (330 ml)", 330, ["beer"], [145, 1.5, 13, 0, 0, 0, 15]],
  ["wine", "Wine", "1 glass (150 ml)", 150, ["wine", "red wine", "white wine"], [125, 0.1, 4, 0, 0, 1, 7]],
];

const DEFAULT_SAT_SHARE = 0.3;

export const INGREDIENTS: Ingredient[] = ROWS.map(([id, name, portion, grams, aliases, v, extra]) => ({
  id,
  name,
  portion,
  grams,
  pieces: extra?.pieces,
  group: extra?.group,
  aliases,
  nutrients: {
    calories: v[0],
    proteinG: v[1],
    carbsG: v[2],
    fatG: v[3],
    fiberG: v[4],
    sugarG: v[5],
    sodiumMg: v[6],
    saturatedFatG: Math.round(v[3] * (extra?.satShare ?? DEFAULT_SAT_SHARE) * 10) / 10,
  },
}));

export const COMPOSITES: Composite[] = [
  { id: "fish_soup", name: "Fish soup", aliases: ["fish soup", "sliced fish soup"], parts: [{ id: "fish", factor: 1.2 }, { id: "veg", factor: 0.8 }, { id: "fish_broth", factor: 1 }] },
  { id: "milky_fish_soup", name: "Milky fish soup", aliases: ["milky fish soup", "fish soup with milk"], parts: [{ id: "fish", factor: 1.2 }, { id: "veg", factor: 0.8 }, { id: "milky_broth", factor: 1 }] },
  { id: "fried_fish_soup", name: "Fried fish soup", aliases: ["fried fish soup"], parts: [{ id: "fried_fish", factor: 1 }, { id: "veg", factor: 0.8 }, { id: "fish_broth", factor: 1 }] },
  { id: "fish_bee_hoon", name: "Fish soup bee hoon", aliases: ["fish bee hoon", "fish beehoon", "fish soup bee hoon", "fish soup beehoon"], parts: [{ id: "fish", factor: 1.2 }, { id: "veg", factor: 0.8 }, { id: "fish_broth", factor: 1 }, { id: "bee_hoon", factor: 1 }] },
  { id: "chicken_rice", name: "Chicken rice", aliases: ["chicken rice", "hainanese chicken rice", "roast chicken rice", "steamed chicken rice"], parts: [{ id: "oily_rice", factor: 1 }, { id: "chicken_rice_chicken", factor: 1 }, { id: "broth", factor: 0.5 }, { id: "chilli", factor: 1 }] },
  { id: "duck_rice", name: "Duck rice", aliases: ["duck rice", "braised duck rice"], parts: [{ id: "rice", factor: 1 }, { id: "duck", factor: 1 }, { id: "sauce", factor: 1.5 }] },
  { id: "char_siew_rice", name: "Char siew rice", aliases: ["char siew rice", "char siu rice", "roast pork rice", "char siew roast pork rice"], parts: [{ id: "rice", factor: 1 }, { id: "char_siew", factor: 1 }, { id: "sauce", factor: 1.5 }] },
  { id: "economy_rice", name: "Economy rice", aliases: ["economy rice", "cai fan", "chap chye png", "mixed rice"], parts: [{ id: "rice", factor: 1 }, { id: "stirfry_veg", factor: 1 }, { id: "sauce", factor: 1.5 }] },
  { id: "yong_tau_foo", name: "Yong tau foo", aliases: ["yong tau foo", "ytf"], parts: [{ id: "fried_tofu", factor: 0.6 }, { id: "fishball", factor: 1 }, { id: "veg", factor: 1 }, { id: "broth", factor: 1 }] },
  // No protein: name it ("salmon poke bowl", "chicken salad bowl").
  { id: "salad_bowl", name: "Salad bowl", aliases: ["salad bowl", "grain bowl"], parts: [{ id: "salad", factor: 1 }, { id: "brown_rice", factor: 0.5 }, { id: "dressing", factor: 1 }] },
  { id: "poke_bowl", name: "Poke bowl", aliases: ["poke bowl", "poke"], parts: [{ id: "rice", factor: 1 }, { id: "salad", factor: 0.5 }, { id: "sauce", factor: 1 }] },
  { id: "fish_porridge", name: "Fish porridge", aliases: ["fish porridge", "fish congee"], parts: [{ id: "porridge", factor: 1 }, { id: "fish", factor: 1 }] },
  { id: "chicken_porridge", name: "Chicken porridge", aliases: ["chicken porridge", "chicken congee"], parts: [{ id: "porridge", factor: 1 }, { id: "chicken_breast", factor: 0.8 }] },
  { id: "fishball_noodles", name: "Fishball noodles", aliases: ["fishball noodles", "fishball noodle", "fishball mee pok", "fish ball noodles"], parts: [{ id: "mee_pok", factor: 1 }, { id: "fishball", factor: 1 }, { id: "fishcake", factor: 0.5 }, { id: "broth", factor: 1 }] },
];
