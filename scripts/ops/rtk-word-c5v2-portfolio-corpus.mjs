#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  composeObservablePayload,
  deriveVisibleTextFromDocument,
  parseObservablePayload,
} from '../../src/renderer/documentContentEnvelope.mjs';

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safety-remediation-v1/current/c5v2-portfolio-corpora-v1';
const DEFAULT_DORIAN_ROOT = '/Volumes/T7-Secure/storage/yalken/word-safety-remediation-v1/current/c5-fullbook-certification/corpus/scenes';

export const C5V2_PORTFOLIO_CORPUS_SCHEMA = 'yalken.rtk.word.c5v2.portfolio-corpus.v1';
export const C5V2_PORTFOLIO_CORPUS_IDS = Object.freeze([
  'dense-prose',
  'dialogue-heavy',
  'nested-structure',
  'near-supported-limit',
  'multilingual-coherent-24',
]);

function sha256Text(value) {
  return `sha256:${crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex')}`;
}

function wordCount(value) {
  return (String(value || '').match(/\b[\p{L}\p{N}][\p{L}\p{N}'’\-]*\b/gu) || []).length;
}

function writeTextAtomicDurable(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  const fd = fs.openSync(tempPath, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, value, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
  const dirFd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(dirFd);
  } finally {
    fs.closeSync(dirFd);
  }
}

function writeJsonAtomicDurable(filePath, value) {
  writeTextAtomicDurable(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizePlainCorpusText(value) {
  return String(value || '')
    .replace(/\r\n?/gu, '\n')
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function denseProseScenes({ dorianRoot = DEFAULT_DORIAN_ROOT } = {}) {
  const files = fs.readdirSync(dorianRoot)
    .filter((name) => /^dorian-\d{2}-.+\.txt$/iu.test(name))
    .sort();
  if (files.length !== 21) throw new Error(`C5V2_PORTFOLIO_DORIAN_SCENE_COUNT_INVALID:${files.length}`);
  return files.map((file, sceneIndex) => {
    const sourcePath = path.join(dorianRoot, file);
    const sourceRaw = fs.readFileSync(sourcePath, 'utf8');
    const paragraphs = normalizePlainCorpusText(sourceRaw).split(/\n{2,}/u);
    const chunkCount = Math.max(4, Math.min(9, Math.ceil(paragraphs.length / 18)));
    const chunkSize = Math.ceil(paragraphs.length / chunkCount);
    const denseParagraphs = [];
    for (let start = 0; start < paragraphs.length; start += chunkSize) {
      denseParagraphs.push(paragraphs.slice(start, start + chunkSize).join(' '));
    }
    const text = denseParagraphs.join('\n\n');
    return {
      file: `${String(sceneIndex + 1).padStart(2, '0')}_dense-${path.basename(file)}`,
      title: `Dense Prose ${String(sceneIndex + 1).padStart(2, '0')}`,
      rawContent: text,
      source: {
        file,
        rawSha256: sha256Text(sourceRaw),
        transformation: 'paragraph-reflow-only-no-synthetic-tail',
      },
    };
  });
}

function dialogueHeavyScenes() {
  const speakers = ['Mara', 'Ivo', 'Noor', 'Chen', 'Sofiya', 'Mateo'];
  const stage = [
    'the harbor bell answers through the fog',
    'the copper relay warms beneath the map',
    'the northern lens catches a narrow star',
    'the tide ledger shows an impossible hour',
    'the keeper marks one safe channel home',
    'the storm wall loosens around the lighthouse',
  ];
  return Array.from({ length: 21 }, (_, sceneIndex) => {
    const paragraphs = [];
    paragraphs.push(`Scene ${sceneIndex + 1}: The Relay at Low Water. The crew continues one night-long attempt to relight the northern lighthouse before the hospital ship reaches the reef.`);
    for (let exchange = 0; exchange < 72; exchange += 1) {
      const speaker = speakers[(sceneIndex + exchange) % speakers.length];
      const listener = speakers[(sceneIndex + exchange + 1) % speakers.length];
      const beat = `D${String(sceneIndex + 1).padStart(2, '0')}E${String(exchange + 1).padStart(3, '0')}`;
      paragraphs.push(`“${listener}, keep ${beat} on the blue circuit; ${stage[exchange % stage.length]}, and we have only ${93 - (sceneIndex * 2 + exchange) % 71} minutes left,” ${speaker} said.`);
      paragraphs.push(`“I hear you,” ${listener} replied. “At ${beat}, I will hold the signal steady until the next bell confirms that the ship has changed course.”`);
    }
    paragraphs.push(`By the end of scene ${sceneIndex + 1}, the relay has advanced one station north, while the same promise—to leave no vessel without a light—binds every voice.`);
    return {
      file: `${String(sceneIndex + 1).padStart(2, '0')}_dialogue-relay.txt`,
      title: `Dialogue Relay ${String(sceneIndex + 1).padStart(2, '0')}`,
      rawContent: paragraphs.join('\n\n'),
    };
  });
}

function nestedStructureScenes() {
  return Array.from({ length: 21 }, (_, sceneIndex) => {
    const content = [];
    const textNode = (text) => ({ type: 'text', text });
    content.push({
      type: 'heading',
      attrs: { level: 1 },
      content: [textNode(`Archive ${sceneIndex + 1}: The Cartographer's Nested Route`)],
    });
    for (let section = 0; section < 6; section += 1) {
      content.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [textNode(`Section ${sceneIndex + 1}.${section + 1}: Meridian ${String.fromCharCode(65 + section)}`)],
      });
      content.push({
        type: 'paragraph',
        content: [textNode(`The cartographer opens route N${String(sceneIndex + 1).padStart(2, '0')}S${section + 1} and records a distinct ridge, bridge, weather sign, and witness before descending into the next level of the atlas.`)],
      });
      for (let subsection = 0; subsection < 3; subsection += 1) {
        const marker = `N${String(sceneIndex + 1).padStart(2, '0')}S${section + 1}D${subsection + 1}`;
        content.push({
          type: 'heading',
          attrs: { level: 3 },
          content: [textNode(`Detail ${marker}: Evidence and Return Path`)],
        });
        content.push({
          type: 'paragraph',
          content: [textNode(`At ${marker}, the survey party compares the river stone, the cedar notch, and the midnight compass reading; each observation remains attached to this exact branch of the route.`)],
        });
        content.push({
          type: 'paragraph',
          content: [textNode(`The return instruction for ${marker} names the previous junction explicitly, so a reader can climb from detail to section to archive without losing the narrative thread.`)],
        });
      }
    }
    const doc = { type: 'doc', content };
    const rawContent = composeObservablePayload({
      doc,
      metaEnabled: true,
      meta: {
        synopsis: `Hierarchical source scene ${sceneIndex + 1} with three supported heading levels.`,
        status: 'чистовик',
        tags: { pov: 'cartographer', line: 'nested-route', place: `archive-${sceneIndex + 1}` },
      },
      cards: [{
        title: `Route card ${sceneIndex + 1}`,
        text: `The card remains auxiliary to the nested scene ${sceneIndex + 1}.`,
        tags: 'nested,qa',
      }],
    });
    return {
      file: `${String(sceneIndex + 1).padStart(2, '0')}_nested-route.txt`,
      title: `Nested Route ${String(sceneIndex + 1).padStart(2, '0')}`,
      rawContent,
      visibleTextSha256: sha256Text(deriveVisibleTextFromDocument(doc)),
    };
  });
}

function nearSupportedLimitScenes({ targetWords = 100_000 } = {}) {
  const safeTarget = Number.isSafeInteger(targetWords) && targetWords >= 21_000 ? targetWords : 100_000;
  const base = Math.floor(safeTarget / 21);
  const remainder = safeTarget % 21;
  const vocabulary = [
    'keeper', 'signal', 'harbor', 'granite', 'lantern', 'weather', 'channel', 'compass', 'tide', 'copper',
    'window', 'vessel', 'north', 'patient', 'archive', 'steady', 'returns', 'before', 'dawn', 'safely',
  ];
  return Array.from({ length: 21 }, (_, sceneIndex) => {
    const sceneTarget = base + (sceneIndex < remainder ? 1 : 0);
    const words = [];
    let ordinal = 0;
    while (words.length < sceneTarget) {
      if (ordinal % 17 === 0) words.push(`L${String(sceneIndex + 1).padStart(2, '0')}W${String(ordinal + 1).padStart(6, '0')}`);
      else words.push(vocabulary[(sceneIndex * 7 + ordinal) % vocabulary.length]);
      ordinal += 1;
    }
    const paragraphs = [];
    for (let start = 0; start < words.length; start += 120) {
      const paragraphWords = words.slice(start, start + 120);
      paragraphs.push(`${paragraphWords.join(' ')}.`);
    }
    return {
      file: `${String(sceneIndex + 1).padStart(2, '0')}_limit-relay.txt`,
      title: `Limit Relay ${String(sceneIndex + 1).padStart(2, '0')}`,
      rawContent: paragraphs.join('\n\n'),
    };
  });
}

const MULTILINGUAL_BEATS = Object.freeze([
  ['en', 'English', 'Mara carries the restored lens toward the northern tower before dawn.'],
  ['es', 'Español', 'Mara lleva la lente restaurada hacia la torre del norte antes del amanecer.'],
  ['fr', 'Français', 'Mara porte la lentille restaurée vers la tour du nord avant l’aube.'],
  ['de', 'Deutsch', 'Mara trägt die reparierte Linse vor Tagesanbruch zum nördlichen Turm.'],
  ['it', 'Italiano', 'Mara porta la lente restaurata verso la torre del nord prima dell’alba.'],
  ['pt', 'Português', 'Mara leva a lente restaurada até a torre do norte antes do amanhecer.'],
  ['nl', 'Nederlands', 'Mara draagt de herstelde lens voor zonsopgang naar de noordelijke toren.'],
  ['pl', 'Polski', 'Mara niesie odnowioną soczewkę do północnej wieży przed świtem.'],
  ['cs', 'Čeština', 'Mara nese opravenou čočku k severní věži ještě před úsvitem.'],
  ['uk', 'Українська', 'Мара несе відновлену лінзу до північної вежі ще до світанку.'],
  ['ru', 'Русский', 'Мара несёт восстановленную линзу к северной башне до рассвета.'],
  ['el', 'Ελληνικά', 'Η Μάρα μεταφέρει τον επισκευασμένο φακό στον βόρειο πύργο πριν χαράξει.'],
  ['tr', 'Türkçe', 'Mara onarılan merceği şafaktan önce kuzey kulesine taşıyor.'],
  ['ar', 'العربية', 'تحمل مارا العدسة التي أُصلحت إلى البرج الشمالي قبل الفجر.'],
  ['he', 'עברית', 'מארה נושאת את העדשה המתוקנת אל המגדל הצפוני לפני עלות השחר.'],
  ['fa', 'فارسی', 'مارا عدسی تعمیرشده را پیش از سپیده‌دم به برج شمالی می‌برد.'],
  ['hi', 'हिन्दी', 'मारा भोर से पहले सुधारा हुआ लेंस उत्तरी मीनार तक ले जाती है।'],
  ['bn', 'বাংলা', 'মারা ভোরের আগে মেরামত করা লেন্সটি উত্তর দিকের মিনারে নিয়ে যায়।'],
  ['ta', 'தமிழ்', 'விடியற்காலைக்கு முன் மாரா சீரமைக்கப்பட்ட வில்லையை வடக்குக் கோபுரத்துக்கு எடுத்துச் செல்கிறாள்.'],
  ['th', 'ไทย', 'มารานำเลนส์ที่ซ่อมแล้วไปยังหอคอยทางเหนือก่อนรุ่งสาง'],
  ['vi', 'Tiếng Việt', 'Mara mang thấu kính đã sửa đến ngọn tháp phía bắc trước bình minh.'],
  ['zh-Hans', '简体中文', '玛拉在黎明前把修复好的透镜送往北塔。'],
  ['ja', '日本語', 'マーラは夜明け前に修復したレンズを北の塔へ運ぶ。'],
  ['ko', '한국어', '마라는 동이 트기 전에 수리한 렌즈를 북쪽 탑으로 옮긴다.'],
]);

function multilingualCoherentScenes() {
  return Array.from({ length: 21 }, (_, sceneIndex) => {
    const primary = MULTILINGUAL_BEATS[sceneIndex % MULTILINGUAL_BEATS.length];
    const secondary = MULTILINGUAL_BEATS[(sceneIndex + 21) % MULTILINGUAL_BEATS.length];
    const paragraphs = [
      `Relay chapter ${sceneIndex + 1}. The same crew passes one repaired lighthouse lens northward, and each language records the next link in a single continuous journey.`,
      `${primary[1]} (${primary[0]}): ${primary[2]}`,
      `${secondary[1]} (${secondary[0]}): ${secondary[2]}`,
    ];
    for (let beat = 0; beat < 24; beat += 1) {
      const language = MULTILINGUAL_BEATS[(sceneIndex + beat) % MULTILINGUAL_BEATS.length];
      const marker = `ML${String(sceneIndex + 1).padStart(2, '0')}B${String(beat + 1).padStart(2, '0')}`;
      paragraphs.push(`${language[1]} ${marker}: ${language[2]} The ${marker} log confirms that the lens, the route, and the promise remain attached to this exact narrative beat.`);
    }
    if (sceneIndex === 0) {
      paragraphs.push('Unicode witness: café and café remain distinct source sequences; coder 👩‍💻 keeps the ZWJ sequence intact; العربية والعברית preserve right-to-left order.');
    }
    if (sceneIndex === 1) {
      paragraphs.push('Script witness: हिन्दी, বাংলা, தமிழ், ไทย, 中文, 日本語, and 한국어 remain grapheme-safe without silent normalization.');
    }
    paragraphs.push(`At the close of relay chapter ${sceneIndex + 1}, the crew hands the protected lens to the next speaker and advances one station toward the northern light.`);
    return {
      file: `${String(sceneIndex + 1).padStart(2, '0')}_multilingual-relay.txt`,
      title: `Multilingual Relay ${String(sceneIndex + 1).padStart(2, '0')}`,
      rawContent: paragraphs.join('\n\n'),
    };
  });
}

function corpusDefinition(corpusId, options = {}) {
  if (corpusId === 'dense-prose') {
    return {
      title: 'Dense Prose Public-Domain Reflow Portfolio',
      sourceType: 'public-domain-derived-deterministic-qa',
      topology: 'one-21-scene-dense-prose-manuscript',
      characteristics: ['dense-prose', 'long-paragraphs', 'public-domain-source', 'no-synthetic-tail'],
      languageTags: ['en'],
      scenes: denseProseScenes(options),
    };
  }
  if (corpusId === 'dialogue-heavy') {
    return {
      title: 'The Northern Relay Dialogue-Heavy QA Manuscript',
      sourceType: 'deterministic-original-internal-qa',
      topology: 'one-21-scene-dialogue-heavy-manuscript',
      characteristics: ['dialogue-heavy', 'curly-quotes', 'speaker-turns', 'continuous-story'],
      languageTags: ['en'],
      scenes: dialogueHeavyScenes(),
    };
  }
  if (corpusId === 'nested-structure') {
    return {
      title: 'The Cartographer Nested-Structure QA Manuscript',
      sourceType: 'deterministic-original-rich-envelope-qa',
      topology: 'one-21-scene-three-level-heading-manuscript',
      characteristics: ['rich-scene-envelope', 'heading-levels-1-2-3', 'meta', 'cards', 'continuous-story'],
      languageTags: ['en'],
      scenes: nestedStructureScenes(),
    };
  }
  if (corpusId === 'near-supported-limit') {
    const scenes = nearSupportedLimitScenes(options);
    return {
      title: 'Near Supported 100K-Word Relay QA Manuscript',
      sourceType: 'deterministic-original-scale-qa',
      topology: 'one-21-scene-near-supported-limit-manuscript',
      characteristics: ['near-supported-100k-word-boundary', 'multi-scene', 'unique-range-markers'],
      languageTags: ['en'],
      scenes,
    };
  }
  if (corpusId === 'multilingual-coherent-24') {
    return {
      title: 'The Lighthouse Relay Coherent 24-Language QA Manuscript',
      sourceType: 'deterministic-original-multilingual-qa',
      topology: 'one-21-scene-coherent-24-language-manuscript',
      characteristics: [
        'twenty-four-languages', 'coherent-story', 'composed-decomposed', 'emoji-zwj', 'rtl', 'cjk', 'indic', 'thai',
      ],
      languageTags: MULTILINGUAL_BEATS.map(([tag]) => tag),
      scenes: multilingualCoherentScenes(),
    };
  }
  throw new Error(`C5V2_PORTFOLIO_CORPUS_ID_UNSUPPORTED:${corpusId}`);
}

export function buildC5V2PortfolioCorpus(corpusId, options = {}) {
  const definition = corpusDefinition(corpusId, options);
  const scenes = definition.scenes.map((scene, index) => {
    const parsed = parseObservablePayload(scene.rawContent);
    if (parsed.issue) throw new Error(`C5V2_PORTFOLIO_SCENE_ENVELOPE_INVALID:${corpusId}:${index + 1}`);
    const rawContent = scene.rawContent;
    const visibleText = parsed.text;
    return {
      ordinal: index + 1,
      file: scene.file,
      title: scene.title,
      rawContent,
      rawSourceSha256: sha256Text(rawContent),
      visibleTextSha256: sha256Text(visibleText),
      wordCount: wordCount(visibleText),
      observableEnvelopeVersion: parsed.doc ? 2 : 1,
      source: scene.source || null,
    };
  });
  const expectedWordCount = scenes.reduce((sum, scene) => sum + scene.wordCount, 0);
  return {
    schemaVersion: C5V2_PORTFOLIO_CORPUS_SCHEMA,
    corpusId,
    title: definition.title,
    sourceType: definition.sourceType,
    topology: definition.topology,
    characteristics: definition.characteristics,
    languageTags: definition.languageTags,
    sceneCount: scenes.length,
    expectedWordCount,
    syntheticTailAuthority: false,
    scenes,
  };
}

export function writeC5V2PortfolioCorpus({ corpusId, root = DEFAULT_ROOT, ...options } = {}) {
  const corpus = buildC5V2PortfolioCorpus(corpusId, options);
  const corpusRoot = path.join(root, corpusId);
  const sceneRoot = path.join(corpusRoot, 'scenes');
  fs.mkdirSync(sceneRoot, { recursive: true });
  const manifestScenes = corpus.scenes.map((scene) => {
    const contentPath = path.join(sceneRoot, scene.file);
    writeTextAtomicDurable(contentPath, scene.rawContent);
    return {
      ordinal: scene.ordinal,
      file: scene.file,
      title: scene.title,
      contentPath: path.relative(corpusRoot, contentPath),
      rawSourceSha256: scene.rawSourceSha256,
      visibleTextSha256: scene.visibleTextSha256,
      wordCount: scene.wordCount,
      observableEnvelopeVersion: scene.observableEnvelopeVersion,
      source: scene.source,
    };
  });
  const manifest = {
    schemaVersion: corpus.schemaVersion,
    corpusId: corpus.corpusId,
    title: corpus.title,
    sourceType: corpus.sourceType,
    topology: corpus.topology,
    characteristics: corpus.characteristics,
    languageTags: corpus.languageTags,
    sceneCount: corpus.sceneCount,
    expectedWordCount: corpus.expectedWordCount,
    syntheticTailAuthority: corpus.syntheticTailAuthority,
    scenes: manifestScenes,
  };
  const manifestPath = path.join(corpusRoot, 'corpus-manifest.json');
  writeJsonAtomicDurable(manifestPath, manifest);
  return {
    corpusId,
    corpusRoot,
    manifestPath,
    manifestSha256: sha256Text(fs.readFileSync(manifestPath, 'utf8')),
    sceneCount: manifest.sceneCount,
    wordCount: manifest.expectedWordCount,
    languageCount: manifest.languageTags.length,
  };
}

export function writeC5V2PortfolioCorpora({
  root = DEFAULT_ROOT,
  corpusIds = C5V2_PORTFOLIO_CORPUS_IDS,
  ...options
} = {}) {
  return corpusIds.map((corpusId) => writeC5V2PortfolioCorpus({ corpusId, root, ...options }));
}

function parseArgs(argv) {
  const options = { root: DEFAULT_ROOT, corpusIds: [...C5V2_PORTFOLIO_CORPUS_IDS] };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root') {
      options.root = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--corpus') {
      options.corpusIds = [argv[index + 1]];
      index += 1;
    }
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const result = writeC5V2PortfolioCorpora(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 'yalken.rtk.word.c5v2.portfolio-corpus-write-result.v1',
      corpora: result,
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exit(1);
  }
}
