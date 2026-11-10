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
  "join.offline": "Can't reach the game server. Check your internet connection.",
  "net.lost": "Connection lost, reconnecting…",
  "net.online": "Online",
  "net.connecting": "Connecting…",
  "lobby.waiting": "Waiting for the teacher to start the game",
  "lobby.you": "You",
  "lobby.team": "Your team",
  "lobby.solo": "Everyone for themselves",
  "lobby.noTeamYet": "The teacher will put you in a team",
  "lobby.room": "Room {code}",
  "lobby.leave": "Leave",
  "ended.kicked": "The teacher removed you from the room",
  "ended.closed": "The room is closed",
  "ended.hint": "You can join another game with a new code.",
  "ended.again": "Join another room",
  "teacher.code": "Room code",
  "teacher.inRoom": "In the room: {n}",
  "teacher.copyLink": "Copy link",
  "teacher.copyCode": "Copy code",
  "teacher.copied": "Copied",
  "teacher.linkHint": "Send this link to the class chat",
  "teacher.empty": "Nobody has joined yet",
  "teacher.emptyHint": "Send the link to the class chat — students will appear here.",
  "teacher.mode.solo": "Everyone for themselves",
  "teacher.mode.teams2": "2 teams",
  "teacher.mode.teams3": "3 teams",
  "teacher.shuffle": "Shuffle into teams",
  "teacher.noTeam": "No team",
  "teacher.noTeamHint": "Drag names into teams",
  "teacher.dropHere": "Drop here",
  "teacher.rename": "Rename",
  "teacher.kick": "Remove",
  "teacher.kickConfirm": "Remove for sure?",
  "teacher.save": "Save",
  "teacher.offline": "offline",
  "teacher.new": "new",
  "teacher.chooseGame": "Choose a game",
  "teacher.soon": "Games arrive in the next update",
  "teacher.closeRoom": "Close room",
  "teacher.openPanel": "Teacher panel",
  "teacher.creating": "Creating a room…",
  "sound.on": "Sound",
  "common.send": "Submit",
  "common.start": "Start game",
  "common.cancel": "Cancel",
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
  "join.offline": "Сервер игры недоступен. Проверь интернет.",
  "net.lost": "Соединение потеряно, переподключаемся…",
  "net.online": "В сети",
  "net.connecting": "Подключаемся…",
  "lobby.waiting": "Ждём, пока учитель начнёт игру",
  "lobby.you": "Ты",
  "lobby.team": "Твоя команда",
  "lobby.solo": "Каждый сам за себя",
  "lobby.noTeamYet": "Учитель скоро добавит тебя в команду",
  "lobby.room": "Комната {code}",
  "lobby.leave": "Выйти",
  "ended.kicked": "Учитель убрал тебя из комнаты",
  "ended.closed": "Комната закрыта",
  "ended.hint": "Можно войти в другую игру по новому коду.",
  "ended.again": "Войти в другую комнату",
  "teacher.code": "Код комнаты",
  "teacher.inRoom": "В комнате: {n}",
  "teacher.copyLink": "Скопировать ссылку",
  "teacher.copyCode": "Скопировать код",
  "teacher.copied": "Скопировано",
  "teacher.linkHint": "Отправьте ссылку в группу класса",
  "teacher.empty": "Пока никто не подключился",
  "teacher.emptyHint": "Отправьте ссылку в группу — ученики появятся здесь.",
  "teacher.mode.solo": "Каждый сам за себя",
  "teacher.mode.teams2": "2 команды",
  "teacher.mode.teams3": "3 команды",
  "teacher.shuffle": "Распределить случайно",
  "teacher.noTeam": "Без команды",
  "teacher.noTeamHint": "Перетащите имена в команды",
  "teacher.dropHere": "Перетащите сюда",
  "teacher.rename": "Переименовать",
  "teacher.kick": "Выгнать",
  "teacher.kickConfirm": "Точно выгнать?",
  "teacher.save": "Сохранить",
  "teacher.offline": "не в сети",
  "teacher.new": "новый",
  "teacher.chooseGame": "Выбрать игру",
  "teacher.soon": "Игры появятся в следующем обновлении",
  "teacher.closeRoom": "Закрыть комнату",
  "teacher.openPanel": "Панель учителя",
  "teacher.creating": "Создаём комнату…",
  "sound.on": "Звук",
  "common.send": "Отправить",
  "common.start": "Начать игру",
  "common.cancel": "Отмена",
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
  "join.offline": "Оюн сервери жеткиликсиз. Интернетти текшер.",
  "net.lost": "Байланыш үзүлдү, кайра туташууда…",
  "net.online": "Онлайн",
  "net.connecting": "Туташууда…",
  "lobby.waiting": "Мугалим оюнду баштаганын күтүп жатабыз",
  "lobby.you": "Сен",
  "lobby.team": "Сенин командаң",
  "lobby.solo": "Ар ким өзү үчүн",
  "lobby.noTeamYet": "Мугалим сени жакында командага кошот",
  "lobby.room": "Бөлмө {code}",
  "lobby.leave": "Чыгуу",
  "ended.kicked": "Мугалим сени бөлмөдөн чыгарды",
  "ended.closed": "Бөлмө жабылды",
  "ended.hint": "Жаңы код менен башка оюнга кире аласың.",
  "ended.again": "Башка бөлмөгө кирүү",
  "teacher.code": "Бөлмөнүн коду",
  "teacher.inRoom": "Бөлмөдө: {n}",
  "teacher.copyLink": "Шилтемени көчүрүү",
  "teacher.copyCode": "Кодду көчүрүү",
  "teacher.copied": "Көчүрүлдү",
  "teacher.linkHint": "Шилтемени класстын тобуна жөнөтүңүз",
  "teacher.empty": "Азырынча эч ким кошула элек",
  "teacher.emptyHint": "Шилтемени топко жөнөтүңүз — окуучулар бул жерде пайда болот.",
  "teacher.mode.solo": "Ар ким өзү үчүн",
  "teacher.mode.teams2": "2 команда",
  "teacher.mode.teams3": "3 команда",
  "teacher.shuffle": "Кокус бөлүштүрүү",
  "teacher.noTeam": "Командасыз",
  "teacher.noTeamHint": "Аттарды командаларга сүйрөңүз",
  "teacher.dropHere": "Бул жерге сүйрөңүз",
  "teacher.rename": "Атын өзгөртүү",
  "teacher.kick": "Чыгаруу",
  "teacher.kickConfirm": "Чын эле чыгарасызбы?",
  "teacher.save": "Сактоо",
  "teacher.offline": "оффлайн",
  "teacher.new": "жаңы",
  "teacher.chooseGame": "Оюнду тандоо",
  "teacher.soon": "Оюндар кийинки жаңыртууда пайда болот",
  "teacher.closeRoom": "Бөлмөнү жабуу",
  "teacher.openPanel": "Мугалимдин панели",
  "teacher.creating": "Бөлмө түзүлүүдө…",
  "sound.on": "Үн",
  "common.send": "Жөнөтүү",
  "common.start": "Оюнду баштоо",
  "common.cancel": "Жокко чыгаруу",
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

/** Код комнаты для показа: «482 913». */
export const prettyCode = (c: string) => (c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c);
