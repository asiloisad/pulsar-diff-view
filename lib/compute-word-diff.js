function computeWordDiff(oldText, newText) {
  var addedWords = [];
  var removedWords = [];

  if (oldText && newText) { 
    var JsDiff = require('diff');
    var wordDiff = JsDiff.diffWordsWithSpace(oldText, newText);

    // split into two lists: added + removed
    wordDiff.forEach(part => {
      if (part.added) {
        part.changed = true;
        addedWords.push(part);
      } else if (part.removed) {
        part.changed = true;
        removedWords.push(part);
      } else {
        addedWords.push(part);
        removedWords.push(part);
      }
    });
  }

  return {
    addedWords,
    removedWords,
  };
}

module.exports = {
  computeWordDiff
};
