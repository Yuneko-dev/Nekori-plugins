const PUA_START = 0xe3e8;
const PUA_END = 0xe55b;

/**
 * Character mapping for Fanqie awesome-font `dc027189e0ba4cd` (DNMrHsV173Pd4pgy),
 * used on /reader/* and /rank* pages. Slots cover U+E3E8..U+E55B; \uFFFF marks unused code points.
 */
const READER_FONT_TABLE =
  'D在主特家军然表场4要只v和\uFFFF6别还g现儿岁\uFFFF\uFFFF此象月3出战工相o男直失世F都平文什VO将真T那当\uFFFF会立些u是十张学气大爱两命全后东性通被1它乐接而感车山公了常以何可话先pi叫轻M士w着变尔快l个说少色里安花远7难师放t报认面道S\uFFFF克地度I好机U民写把万同水新没书电吃像斯5为y白几日教看但第加候作上拉住有法r事应位利你声身国问马女他Y比父xAHNsX边美对所金活回意到z从j知又内因点Q三定8Rb正或夫向德听更\uFFFF得告并本q过记L让打f人就者去原满体做经K走如孩cG给使物\uFFFF最笑部\uFFFF员等受k行一条果动光门头见往自解成处天能于名其发总母的死手入路进心来h时力多开已许d至由很界n小与Z想代么分生口再妈望次西风种带J\uFFFF实情才这\uFFFFE我神格长觉间年眼无不亲关结0友信下却重己老2音字m呢明之前高PB目太e9起稜她也W用方子英每理便四数期中C外样a海们任';

/**
 * Character mapping for Fanqie awesome-font `fKts9tCXDjS49UhH`,
 * used by /api/library/book_list. Slots cover U+E3E8..U+E55B; \uFFFF marks unused code points.
 */
const LIBRARY_FONT_TABLE =
  '体y十现快便话却月物水的放知爱万\uFFFF表风理O老也p常克平几最主她s将法情o光a我呢J员太每望受教w利军已U人如变得要少斯门电m男没AK国时中走么何口小向问轻Td神下间车fG度D又大面远就写j给通起实E\uFFFF它去S到道数吃们加P是无把事西多界\uFFFF发新外活解孩只作前Y尔经\uFFFFu心告父等Q民全这9果安\uFFFFi母8r说任先和地C张战场g像cq你使\uFFFF样总目x性处音头\uFFFF应乐关能花l当名手4重字声力友然生代内里本回真入师象\uFFFF0点R亲V种动英命ZhX做特边高有B为期自年马认出接至H正方感所明者\uFFFFF住学还分意更其n但比觉以由死家让失士L2I金叫身报听W再原山海白很见5直位第工个开岁好用都于可同3次四\uFFFF日信与女笑满并部什不从或机此\uFFFF了记三e些bN夫会才儿眼两美被一公来立z长对己看k许因相色后往打结格过世气7子条在书之定v拉成进带着东上想天他妈1文而路那别德6Mt行候难';

function decodeWithTable(input: string, table: string): string {
  if (!input) return input;
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code >= PUA_START && code <= PUA_END) {
      const mapped = table[code - PUA_START];
      out += mapped && mapped !== '\uFFFF' ? mapped : input[i];
    } else {
      out += input[i];
    }
  }
  return out;
}

/** Decode PUA-obfuscated text from Fanqie reader and rank pages. */
export function decodeReaderFont(text: string): string {
  return decodeWithTable(text, READER_FONT_TABLE);
}

/** Decode PUA-obfuscated text from Fanqie library book_list API responses. */
export function decodeLibraryFont(text: string): string {
  return decodeWithTable(text, LIBRARY_FONT_TABLE);
}

/** Check whether a decoded string still contains Private Use Area characters. */
export function hasPuaChars(text: string): boolean {
  return /[\uE000-\uF8FF]/.test(text);
}
