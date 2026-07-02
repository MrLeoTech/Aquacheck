/**
 * AquaCheck v3.1 - OCR (Tesseract.js)
 */
const AquaOCR = (() => {
  let worker = null;

  async function getWorker() {
    if (worker) return worker;
    if (typeof Tesseract === 'undefined') {
      throw new Error('Tesseract.js não carregado');
    }
    worker = await Tesseract.createWorker('por+eng', 1, {
      logger: () => {}
    });
    return worker;
  }

  function extractNumbers(text) {
    const cleaned = text.replace(/[,]/g, '.').replace(/[^\d.\n\s]/g, ' ');
    const numbers = cleaned.match(/\d+\.?\d*/g)?.map(Number).filter(n => !isNaN(n)) || [];
    return numbers;
  }

  function parseDoseadoraText(text) {
    const result = {};
    const lower = text.toLowerCase();

    const phMatch = lower.match(/ph[\s:]*(\d+[.,]\d+)/i) || text.match(/(\d+[.,]\d{1,2})(?=\s*(?:ph|$|\n))/i);
    if (phMatch) {
      const v = parseFloat(phMatch[1].replace(',', '.'));
      if (v >= 6 && v <= 9) result.ph = v.toFixed(2);
    }

    const clMatch = lower.match(/cl(?:oro)?[\s:]*(\d+[.,]\d+)/i);
    if (clMatch) {
      const v = parseFloat(clMatch[1].replace(',', '.'));
      if (v >= 0 && v <= 10) result.cloro = v.toFixed(2);
    }

    const tempMatch = lower.match(/(?:temp|°c)[\s:]*(\d+[.,]?\d*)/i);
    if (tempMatch) {
      const v = parseFloat(tempMatch[1].replace(',', '.'));
      if (v >= 10 && v <= 45) result.temp = v.toFixed(1);
    }

    if (!result.ph || !result.cloro) {
      const nums = extractNumbers(text);
      const phCandidates = nums.filter(n => n >= 6.5 && n <= 8.5);
      const clCandidates = nums.filter(n => n >= 0.1 && n <= 5);
      const tempCandidates = nums.filter(n => n >= 15 && n <= 40);

      if (!result.ph && phCandidates.length) result.ph = phCandidates[0].toFixed(2);
      if (!result.cloro && clCandidates.length) result.cloro = clCandidates[0].toFixed(2);
      if (!result.temp && tempCandidates.length) result.temp = tempCandidates[0].toFixed(1);
    }

    return result;
  }

  async function recognize(imageData) {
    const w = await getWorker();
    const { data: { text } } = await w.recognize(imageData);
    return parseDoseadoraText(text);
  }

  async function terminate() {
    if (worker) {
      await worker.terminate();
      worker = null;
    }
  }

  return { recognize, terminate, parseDoseadoraText };
})();
