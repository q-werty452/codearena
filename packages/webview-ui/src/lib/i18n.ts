import { createContext, useContext } from "react";

/**
 * Локализация. Английский — по умолчанию для open source,
 * русский и кыргызский — для класса. Ключи плоские, подстановка {name}.
 */
const en = {
  "app.tagline": "Coding games for your class",
  "join.title": "Join the game",
  "join.code": "Room code",
  "join.name": "First and last name",
  "join.namePlaceholder": "e.g. Aibek K.",
  "join.nameHint": "Your teacher will see this name",
  "join.submit": "Join",
  "join.teacher": "I'm a teacher — create a room",
  "join.badCode": "No room with this code",
  "join.nameTaken": "This name is taken — add your last name",
  "join.nameShort": "Enter at least 2 letters",
  "net.lost": "Connection lost, reconnecting…",
  "lobby.waiting": "Waiting for the teacher to start the game",
  "lobby.you": "You",
  "lobby.team": "Your team",
  "lobby.solo": "Everyone for themselves",
  "sound.on": "Sound",
  "common.copy": "Copy link",
  "common.copied": "Copied",
  "common.send": "Submit",
  "common.start": "Start game",
} as const;

export type MessageKey = keyof typeof en;
type Dict = Record<MessageKey, string>;

const ru: Dict = {
  "app.tagline": "Игры по программированию для класса",
  "join.title": "Войти в игру",
  "join.code": "Код комнаты",
  "join.name": "Имя и фамилия",
  "join.namePlaceholder": "Например, Айбек К.",
  "join.nameHint": "Это имя увидит учитель",
  "join.submit": "Войти",
  "join.teacher": "Я учитель — создать комнату",
  "join.badCode": "Комнаты с таким кодом нет",
  "join.nameTaken": "Такое имя уже есть — допиши фамилию",
  "join.nameShort": "Напиши хотя бы 2 буквы",
  "net.lost": "Соединение потеряно, переподключаемся…",
  "lobby.waiting": "Ждём, пока учитель начнёт игру",
  "lobby.you": "Ты",
  "lobby.team": "Твоя команда",
  "lobby.solo": "Каждый сам за себя",
  "sound.on": "Звук",
  "common.copy": "Скопировать ссылку",
  "common.copied": "Скопировано",
  "common.send": "Отправить",
  "common.start": "Начать игру",
};

// Кыргызский: черновой перевод, нужна вычитка носителем языка.
const ky: Dict = {
  "app.tagline": "Класс үчүн программалоо оюндары",
  "join.title": "Оюнга кирүү",
  "join.code": "Бөлмөнүн коду",
  "join.name": "Аты-жөнү",
  "join.namePlaceholder": "Мисалы, Айбек К.",
  "join.nameHint": "Бул атты мугалим көрөт",
  "join.submit": "Кирүү",
  "join.teacher": "Мен мугалиммин — бөлмө түзүү",
  "join.badCode": "Мындай коду бар бөлмө жок",
  "join.nameTaken": "Бул ат бош эмес — фамилияңды кош",
  "join.nameShort": "Жок дегенде 2 тамга жаз",
  "net.lost": "Байланыш үзүлдү, кайра туташууда…",
  "lobby.waiting": "Мугалим оюнду баштаганын күтүп жатабыз",
  "lobby.you": "Сен",
  "lobby.team": "Сенин командаң",
  "lobby.solo": "Ар ким өзү үчүн",
  "sound.on": "Үн",
  "common.copy": "Шилтемени көчүрүү",
  "common.copied": "Көчүрүлдү",
  "common.send": "Жөнөтүү",
  "common.start": "Оюнду баштоо",
};

export const DICTS = { en, ru, ky } as const;
export type Locale = keyof typeof DICTS;

export function pickLocale(lang: string | undefined): Locale {
  const l = (lang ?? "").toLowerCase();
  if (l.startsWith("ru")) return "ru";
  if (l.startsWith("ky")) return "ky";
  return "en";
}

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  let s: string = DICTS[locale][key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export const LocaleContext = createContext<Locale>("en");

export function useT() {
  const locale = useContext(LocaleContext);
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
}
