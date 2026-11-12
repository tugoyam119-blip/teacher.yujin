export const MEANINGLESS_ANSWER_MESSAGE =
  "의미 없는 문자·기호 또는 같은 표현이 반복되어 있습니다. 자신의 판단과 이유가 드러나는 문장으로 수정한 뒤 다시 시도하세요.";

export const REPETITION_MESSAGE = MEANINGLESS_ANSWER_MESSAGE;

export const narrativeFields = [
  ["exportReason", "수출기업이 유리해질 수 있는 이유", 2],
  ["importReason", "수입기업이 불리해질 수 있는 이유", 2],
  ["policyEffect", "선택한 정책의 기대 효과", 4],
  ["policyRisk", "발생할 수 있는 부작용", 4],
  ["report", "최종 대응 보고서", 5],
];

function compact(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function tokens(value) {
  return compact(value).match(/[가-힣a-z0-9]+/g) || [];
}

function hasRepeatedChunk(value) {
  const text = value.replace(/\s/g, "");
  for (let size = 1; size <= Math.min(12, Math.floor(text.length / 3)); size += 1) {
    for (let start = 0; start + size * 3 <= text.length; start += 1) {
      const chunk = text.slice(start, start + size);
      let repeats = 1;
      while (text.slice(start + repeats * size, start + (repeats + 1) * size) === chunk) repeats += 1;
      if (repeats >= 3 && repeats * size >= Math.max(12, text.length * 0.6)) return true;
    }
  }
  return false;
}

export function isMeaninglessRepetition(value) {
  const text = compact(value);
  if (!text) return false;

  const noSpace = text.replace(/\s/g, "");
  const meaningful = noSpace.match(/[가-힣a-z0-9]/g) || [];
  const symbols = noSpace.match(/[^가-힣a-z0-9]/g) || [];
  const jamo = noSpace.match(/[ㄱ-ㅎㅏ-ㅣ]/g) || [];

  if (noSpace.length >= 10 && meaningful.length / noSpace.length < 0.55) return true;
  if (symbols.length >= 8 && symbols.length / noSpace.length >= 0.35) return true;
  if (/^[0-9]+$/.test(noSpace)) return true;
  if (jamo.length >= 6 && jamo.length / noSpace.length >= 0.45) return true;
  if (/([^\s])\1{3,}/u.test(noSpace)) return true;
  if (hasRepeatedChunk(text)) return true;

  const words = tokens(text);
  if (words.length >= 5) {
    const counts = new Map();
    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
    const max = Math.max(...counts.values());
    if (max / words.length >= 0.6 && counts.size <= 3) return true;

    for (let size = 1; size <= Math.min(10, Math.floor(words.length / 3)); size += 1) {
      for (let start = 0; start + size * 3 <= words.length; start += 1) {
        const phrase = words.slice(start, start + size).join(" ");
        if (
          phrase === words.slice(start + size, start + size * 2).join(" ") &&
          phrase === words.slice(start + size * 2, start + size * 3).join(" ")
        ) return true;
      }
    }
  }
  return false;
}

export function findRepeatedNarrative(answers, step) {
  for (const [field, label, fieldStep] of narrativeFields) {
    if (step && fieldStep !== step) continue;
    if (isMeaninglessRepetition(answers?.[field])) {
      return { field, label, step: fieldStep, message: MEANINGLESS_ANSWER_MESSAGE };
    }
  }
  return null;
}
