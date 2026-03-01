const WORDS = [
  // Animals
  'cat', 'dog', 'elephant', 'giraffe', 'penguin', 'dolphin', 'butterfly',
  'octopus', 'kangaroo', 'flamingo', 'whale', 'tiger', 'panda', 'parrot',
  'turtle', 'rabbit', 'snake', 'eagle', 'shark', 'monkey',
  // Objects
  'umbrella', 'guitar', 'telescope', 'bicycle', 'rocket', 'diamond',
  'headphones', 'camera', 'lighthouse', 'volcano', 'airplane', 'balloon',
  'castle', 'crown', 'sword', 'piano', 'candle', 'robot', 'spaceship',
  'treasure', 'compass', 'hourglass', 'parachute', 'skateboard',
  // Food
  'pizza', 'hamburger', 'sushi', 'watermelon', 'pancake', 'cupcake',
  'popcorn', 'taco', 'donut', 'icecream', 'avocado', 'cookie',
  // Nature
  'rainbow', 'mountain', 'waterfall', 'tornado', 'sunset', 'aurora',
  'cactus', 'mushroom', 'island', 'snowflake', 'forest', 'ocean',
  // Actions/Concepts
  'dancing', 'sleeping', 'fishing', 'surfing', 'juggling', 'camping',
  'swimming', 'painting', 'singing', 'dreaming', 'flying', 'climbing',
  // Things
  'fireworks', 'rollercoaster', 'haunted house', 'treasure map',
  'magic wand', 'solar system', 'hot air balloon', 'pirate ship',
  'time machine', 'ninja', 'superhero', 'mermaid', 'unicorn', 'dragon',
];

function getRandomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function getWordChoices(count = 3) {
  const shuffled = [...WORDS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function generateHint(word) {
  return word.replace(/[a-zA-Z]/g, (char, index) => {
    if (index === 0 || Math.random() < 0.2) return char;
    return '_';
  });
}

module.exports = { getRandomWord, getWordChoices, generateHint, WORDS };
