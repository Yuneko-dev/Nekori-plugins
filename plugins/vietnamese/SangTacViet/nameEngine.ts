/* eslint-disable no-useless-escape */
import type { CheerioAPI } from 'cheerio';

import { hanvietdic } from './dict';

/**
 * Proper-noun (person name) auto-replacement, ported from STV `qtOnline.js`
 * (`meanstrategy.people2` + supporting tables/helpers).
 *
 * STV serves each word as `<i t="Hán" h="HánViệt" v="đa/nghĩa" p="POS">nghĩa</i>`.
 * The server renders a default meaning into the element text; person names are
 * detected and rendered (TitleCased Hán-Việt) **client-side** by a heuristic
 * driven by a surname table + how often a Hán sequence recurs in the chapter.
 * We replicate that here, operating on the cheerio `<i>` tokens before they get
 * flattened into `<p>` text — using only data already present on the tokens
 * (`t`, `h`, `v`, `p`), so no network call is needed.
 *
 * Faithful to `people2`, with two deliberate simplifications:
 *  - `convertohanviets(chi)` (per-char Hán→âm table) is replaced by joining the
 *    per-token `h` attribute, which is the server's own Hán-Việt reading.
 *  - The `combinedcomm > testcommon` re-segmentation branch (which batch-applies
 *    a name to every occurrence via DOM queries + an extra API call for the
 *    leftover) is dropped; since every token is visited, occurrences are
 *    detected independently and merged in place.
 */

// ── Tables (verbatim from qtOnline.js) ───────────────────────────────
const COMMSURN = 155;

const SURNS =
  '血王李張张劉刘陳陈楊杨黃黄趙赵吳吴周徐孫孙馬马朱胡郭何林羅罗鄭郑梁謝谢宋唐許许韓韩馮冯鄧邓曹彭蕭萧田董袁潘蔣蒋蔡楚余杜葉叶程蘇苏魏呂吕丁任沈姚盧卢姜崔鍾钟譚谭陸陆汪范石廖賈贾夏韋韦傅方鄒邹孟熊秦邱江尹薛閻阎段雷侯龍龙史陶黎賀贺顧顾毛郝龔龚邵萬錢嚴严覃武戴莫孔湯汤康易喬乔賴赖文风施洪辛柯莊庄云凌古夜宁瑜魂墨鱼温焱寒丁万丘丛东严丰临丹义乌乐乔乙乜习于云亓井亢亦京仇仉介付灵仝代仪仰仲任伊伍伏伯何佘余佟佴依侯保俞俱倪傅储儀儲元充兆党公兰关兴冀冉冒农冠冬冯况冷凌凤凯凰凱刁刑列刘別利别剛劉劳勞募勾包匡区區千华卓单卜卞占卢卫印危卿历厉厍厚原厲双叢古召台史叶司吉向吕启吳吴吾呂员呼咸品哈員唐商啓善喬單喻嘉嚴固国圆國圓坚垣堅堯堵塗增墨士壶壺壽夏夔大太奇奉奎奕奚姚姜姬娄娇婁嬌嬴子孔孙孟季孫宁宇安宋完宏宓宗官定宛宜宣宦宫宮宰容宾宿密寇富寧寻寿封尉尋尚尤尧尹居屈展屠山岐岑岚岩岳崇崔嵇嶽巢左巩巫巴布帅师帥師席常干平年幸幹幽广庄庆庐应庞康庾廉廖廣廬延弓弘张張強强彪彭彰後徐從德志念忻怀思恒恩悅悦惠愛愼慈慕慧慶應懷戈戎成战戚戰戴戶户房所扈扬扶承折拓揚操支改政敖文斯新方於施旭旷昌明易昙昝星晁晉晋晏景智曁曆曠曲曹曾朱权李杜束杨杭東松林枚柏柔查柯柳柴栾桂桑桓梁梅楊楚楼榆榮樂樊樓檀權欒欧欽歐步武殳殴段殷毆毋毕毛水汝江池汤汪汲沃沈沉沐沙沧況法泰洛洪倚浙浦涂涢淩淵渊游湛湯源溫滄滑滕滿漆潘潼澹濮烏焦熊燕爱牛牟牧狄狐獒玉王班琪琳琴璩甄甘甯田由申留畢白百皇益盖盛盧相督瞿石祁祈祖祝祥祿禄福禚禹离秋种秦程種稽穆穌空窦竇章童端竹竺符笪筑筱简管箫節範築簡籍粘粟粤粵糜紀紅索紫終經緱繆红纪终经缪罗羅羊羌義羿翁習翟翰耿聂聞聶肖胡胥腾臧臨興舒艾节芦芮花芳苍苏苑苗苻范茅茹荀荆荊荣莊莘莫華萧萨萬葉葛董蒋蒙蒯蒲蒼蓋蓝蓟蓬蔔蔚蔡蔣蔺蕭蕲薄薊薩藉藍藤藺藿蘆蘇蘭虞融衛衡衣袁裘裴褚襄覃觀观解言計許訾詹談諸謝譚计许诸谈谢谭谯谷豐貝貢貫貴費賀賁賈賓賞賴贝贡贯贲贵费贺贾赏赖赫赵越趙路車軒车轩辛辜農边远连逄逍通連逯遊達遠邊邓邛邢邬邯邰邱邴邵邸邹郁郎郏郑郗郜郝郞郤郦部郭鄂鄒鄔鄢鄧鄭酆酈金鈄鈎鈕銀錢錫鍾鐘鐵钟钦钩钮钱铁银锡锺閆閔閻闕關闫闵闻阎阙阚阮阳阴陈陰陳陶陸陽隆隋隗集雍雙離雪雲零雷霍青靖静靜靳鞏鞠韋韓韦韩韶項須顏顔顧项须顾颜風风養饒馬馮駱騰马骆高鬱魏魚魯鮑鱼鲁鲍鳳鴻鸿鹹鹿麒麥麦麴麻黃黄黎黑默黨齊齐龍龐龔龙龚海流君塔旬剑骅霍芒魔南玄冰木水火土枭';

const SURNS2_RAW =
  '百里淳于第五東方东方東閣东阁東郭东郭東門东门端木獨孤独孤爾朱尔朱公孫公孙公羊公冶季冶公西毌丘穀梁谷梁賀蘭贺兰赫連赫连賀若贺若皇甫黄斯呼延兰向令狐陆費陆费甪里閭丘闾丘万俟慕容納蘭纳兰南宮南宫歐陽欧阳沙吒上官申屠司馬司马司徒司空司寇太史澹臺澹台拓跋完顏完颜聞人闻人巫馬巫马夏侯鮮于鲜于西門西门軒轅轩辕楊子杨子耶律樂正乐正尉遲尉迟宇文長孫长孙鍾離钟离諸葛诸葛祝融子車子车左人';

const IGNORE =
  '币都于与务位座我门派乃他她它各用找这是个姐的接弃名入磋嘛年进那几器啊这反和自货就级给回阵里到嗎吗出后被又儿可以吧等呢从弟向和加体离在将所有面竟挺对选中您连仍技性族也们为施内成些野为炼郊要然错当';

const IGNORE2 = '于加体离在年将选论然野炼郊然几的';

const SUFFIX_SINGLE = '道家榜某老哥兄候伯父母叔氏总董导局队少'.split('');
const SUFFIX_DOUBLE =
  '四爷家主大师道友前辈师妹秘书大夫警官小子编剧书记大神校花律师员外上校真人教官仙子仙女婆婆夫人帮主二娘二爷大侠盟主供奉矮子女士阿姨旅长神医叔叔司令主席伯伯同学庄主哥哥镖头少侠大哥女侠导师圣女老板老师长老姑娘少爷将军护卫教习教头公子高手大师大人家人老大老二老三老四老五老六老七老八老九老十先生掌门武者宿主商城师兄侄女宗门管事';

function splitn(str: string, n: number): string[] {
  const arr: string[] = [];
  for (let i = 0; i < str.length; i += n) arr.push(str.slice(i, i + n));
  return arr;
}

const SURNS_SET = new Set(SURNS.split(''));
const SURNS2_SET = new Set(splitn(SURNS2_RAW, 2));
const IGNORE_SET = new Set(IGNORE.split(''));
const IGNORE2_SET = new Set(IGNORE2.split(''));
const SUFFIX_SET = new Set<string>([
  ...SUFFIX_SINGLE,
  ...splitn(SUFFIX_DOUBLE, 2),
]);

// `iscommsurn`: index within SURNS must be <= COMMSURN.
const SURNS_LIST = SURNS.split('');
function iscommsurn(chi: string): boolean {
  const idx = SURNS_LIST.indexOf(chi);
  return idx >= 0 && idx <= COMMSURN;
}

// ── Helpers ──────────────────────────────────────────────────────────
/** Title Case: uppercase the first letter of every whitespace-separated word,
 *  lowercase the rest. */
function titleCase(str: string): string {
  const splitStr = str.toLowerCase().split(' ');
  for (let i = 0; i < splitStr.length; i++) {
    splitStr[i] =
      splitStr[i].charAt(0).toUpperCase() + splitStr[i].substring(1);
  }
  return splitStr.join(' ');
}

/** Lowercase the first letter of the last `n` space-separated words. */
function lowerNLastWord(str: string, n: number): string {
  let lowered = 0;
  for (let i = str.length - 1; i > -1; i--) {
    if (str.charAt(i) === ' ') {
      if (i + 1 === str.length) return str;
      str =
        str.substring(0, i + 1) +
        str.charAt(i + 1).toLowerCase() +
        str.substring(i + 2);
      lowered++;
      if (lowered === n) return str;
    }
  }
  return str.toLowerCase();
}

/** True if any char of `needles` appears in `hay`. */
function instring(hay: string, needleSet: Set<string>): boolean {
  for (const ch of hay) if (needleSet.has(ch)) return true;
  return false;
}

// ── Token model ──────────────────────────────────────────────────────
type Tok = {
  el: unknown; // cheerio dom node
  t: string; // Hán (cn)
  h: string; // Hán-Việt reading
  v: string; // meanings ("a/b/c")
  p: string; // POS tag
  text: string; // current display text
  isname: boolean;
  consumed: boolean;
  spaceRight: boolean; // immediate next sibling is whitespace text
  next: number; // index of next adjacent <i> element, or -1
  prev: number; // index of prev adjacent <i> element, or -1
};

function containName(tok: Tok): boolean {
  return (
    tok.isname ||
    (titleCase(tok.text) === tok.text && tok.text.indexOf(' ') > 0)
  );
}

// ── Engine ───────────────────────────────────────────────────────────
class NameEngine {
  toks: Tok[];
  freq1 = new Map<string, number>();
  // adjacency pair/triple frequencies, exact and prefix (`^`) on last token
  freqExact = new Map<string, number>();
  freqPrefixHeads: { a: string; b: string }[] = []; // pairs (for prefix counting)
  freqTriPrefix: { a: string; b: string; c: string }[] = [];

  constructor(toks: Tok[]) {
    this.toks = toks;
    this.buildFreq();
  }

  private buildFreq() {
    const toks = this.toks;
    for (const tok of toks) {
      const t0 = tok.t;
      if (!t0) continue;
      this.freq1.set(t0, (this.freq1.get(t0) || 0) + 1);
      const j = tok.next;
      if (j >= 0) {
        const t1 = toks[j].t;
        this.freqExact.set(
          t0 + '' + t1,
          (this.freqExact.get(t0 + '' + t1) || 0) + 1,
        );
        this.freqPrefixHeads.push({ a: t0, b: t1 });
        const k = toks[j].next;
        if (k >= 0) {
          const t2 = toks[k].t;
          const key = t0 + '' + t1 + '' + t2;
          this.freqExact.set(key, (this.freqExact.get(key) || 0) + 1);
          this.freqTriPrefix.push({ a: t0, b: t1, c: t2 });
        }
      }
    }
  }

  /** `testcommon`: count of adjacent occurrences of this exact Hán sequence. */
  testcommon(seq: Tok[]): number {
    if (seq.length === 1) return this.freq1.get(seq[0].t) || 0;
    const key = seq.map(s => s.t).join('');
    return this.freqExact.get(key) || 0;
  }

  /** `testcommon2`: like testcommon but the last token is prefix-matched (`t^=`). */
  testcommon2(seq: Tok[]): number {
    if (seq.length === 2) {
      const a = seq[0].t;
      const b = seq[1].t;
      let c = 0;
      for (const p of this.freqPrefixHeads)
        if (p.a === a && p.b.startsWith(b)) c++;
      return c;
    }
    if (seq.length === 3) {
      const a = seq[0].t;
      const b = seq[1].t;
      const cc = seq[2].t;
      let c = 0;
      for (const p of this.freqTriPrefix)
        if (p.a === a && p.b === b && p.c.startsWith(cc)) c++;
      return c;
    }
    return 0;
  }

  testignore(tok: Tok): boolean {
    if (instring(tok.t, IGNORE_SET)) {
      const prev = tok.prev >= 0 ? this.toks[tok.prev] : null;
      if (
        !instring(tok.t, IGNORE2_SET) ||
        (prev && this.testcommon([prev, tok]) < 2)
      ) {
        return true;
      }
    }
    return false;
  }

  /** `containHan2(false)`: returns the meaning if the token's reading appears
   *  in its meaning (i.e. it looks like a name/transliteration), else false. */
  containHan2(tok: Tok): string | false {
    if (instring(tok.t, IGNORE_SET)) {
      const prev = tok.prev >= 0 ? this.toks[tok.prev] : null;
      if (prev) {
        if (!instring(tok.t, IGNORE2_SET) || this.testcommon([prev, tok]) < 2) {
          return false;
        }
      }
    }
    if (tok.isname) return false;
    if (tok.text === tok.h || containName(tok)) return tok.text;
    const m = (tok.v || '').trim();
    if (m.length >= 1 && m.toLowerCase().indexOf(tok.h) >= 0) return tok.v;
    return false;
  }

  testsuffix(text: string, translated: string): string {
    for (let i = 0; i < text.length; i++) {
      if (SUFFIX_SET.has(text.substring(i))) {
        return lowerNLastWord(translated, text.length - i);
      }
    }
    return translated;
  }

  private at(i: number): Tok | null {
    return i >= 0 ? this.toks[i] : null;
  }

  /** Port of `meanstrategy.people2`. */
  people2(node: Tok, leng: number): void {
    const extensible = /[的]/;
    let n2: Tok | null = this.at(node.next);
    const t = node.t;
    let t2 = '';
    let n3: Tok | null = null;
    let t3 = '';
    if (n2) {
      if (n2.isname) return;
      t2 = n2.t;
      if (t2.length === 1 && extensible.test(t2)) {
        n2 = null;
        t2 = '';
      } else {
        n3 = this.at(n2.next);
        if (n3) {
          t3 = n3.t;
          if (t3.length === 1 && extensible.test(t3)) {
            n3 = null;
            t3 = '';
          }
        }
      }
    }
    const n_1 = this.at(node.prev);
    if (node.isname) return;
    if (this.testignore(node)) return;
    if (t[0] === '万' || t[0] === '枚') {
      if (n_1 && /[0-9]/.test(n_1.text)) return;
    }

    const iscomm = iscommsurn(t.substring(0, leng));
    const surncomm = this.testcommon([node]);
    const n1han = this.containHan2(node);
    let n2han: string | false = false;
    let n1n2comm = 0;
    if (n2) {
      n2han = this.containHan2(n2);
      n1n2comm = this.testcommon([node, n2]);
    }
    const maxleng = leng === 1 ? 3 : 4;

    let result: Tok[] = [];
    const setResult = (arr: Tok[]) => {
      if (arr.length > result.length) result = arr;
    };

    if (t.length > leng) {
      if (t.length > leng + 2) {
        return;
      } else {
        if (n2 && n2han && t2.length + t.length <= maxleng && node.spaceRight) {
          if (iscomm || n1n2comm > 2) {
            if (leng === 2) {
              setResult([node, n2]);
            } else if (
              node.h === node.text.toLowerCase() &&
              n2.h === n2.text.toLowerCase()
            ) {
              setResult([node, n2]);
            } else if (
              (n1n2comm > 1 && n1n2comm >= surncomm) ||
              n1n2comm >= 3
            ) {
              setResult([node, n2]);
            }
          } else if ((n1n2comm > 1 && n1n2comm >= surncomm) || n1n2comm >= 3) {
            setResult([node, n2]);
          }
        }
        if (
          t.length <= maxleng &&
          surncomm > 3 &&
          iscomm &&
          n1han &&
          n1han.split('/').length < 3 &&
          !node.p.includes('v')
        ) {
          if (!/.?v.?|ns/.test(node.p)) {
            setResult([node]);
          }
        }
      }
    } else if (
      n2 &&
      t2.length === 1 &&
      node.spaceRight &&
      t2.length + t.length <= maxleng
    ) {
      if (n2han) {
        if (!iscomm && n1n2comm < 2) {
          // skip
        } else {
          setResult([node, n2]);
        }
      } else if (n1n2comm > 3) {
        setResult([node, n2]);
      }
      if (
        n2han &&
        n3 &&
        n2.spaceRight &&
        t3.length + t.length + t2.length <= maxleng
      ) {
        if (
          (this.testcommon2([node, n2, n3]) >= surncomm ||
            this.testcommon([node, n2, n3]) >= 3) &&
          this.containHan2(n3)
        ) {
          setResult([node, n2, n3]);
        }
      }
    } else if (n2 && node.spaceRight && t2.length + t.length <= maxleng) {
      if (n2han) {
        if (iscomm) {
          setResult([node, n2]);
        } else if (n1n2comm >= 2) {
          setResult([node, n2]);
        }
      } else if (n1n2comm > 3) {
        setResult([node, n2]);
      }
    }

    if (result.length > 0) {
      const ignorep = /.?v.?|.?m.?|.?t.?|.?j.?|.?p.?/;
      const last = result[result.length - 1];
      if (ignorep.test(last.p)) {
        if (ignorep.test(result[0].p) && this.testcommon2(result) < 4) {
          return;
        } else if (last.text !== last.h) {
          return;
        } else if (this.testcommon2(result) < 3) {
          return;
        }
      }
      const chi = result.map(r => r.t).join('');
      const hv = result.map(r => r.h).join(' ');
      const name = this.testsuffix(
        chi,
        titleCase(
          this.convertohanviets(chi) ||
            (hv.trim().length
              ? hv
              : `{Error: Missing Hán-Việt reading for ${chi}}`),
        )
          .replace(/^Ti /, 'Tư ')
          .replace('Chư Cát', 'Gia Cát'),
      );
      // merge: name into first token, empty the rest
      this.applyName(result, chi, name);
    }
  }

  private convertohanviet(chi: string) {
    return hanvietdic[chi] || '';
  }
  private convertohanviets(str: string) {
    const result = [];
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < str.length; i++) {
      result.push(this.convertohanviet(str[i]));
    }
    return result.join(' ');
  }

  private applyName(result: Tok[], chi: string, name: string): void {
    const head = result[0];
    head.text = name;
    head.t = chi;
    head.v = name + '/' + head.h;
    head.isname = true;
    for (let k = 1; k < result.length; k++) {
      result[k].text = '';
      result[k].consumed = true;
    }
  }

  run(): void {
    for (const e of this.toks) {
      if (e.consumed || e.isname) continue;
      const cn = e.t;
      if (!cn || cn.length >= 4) continue;
      if (cn.length >= 2 && SURNS2_SET.has(cn.substring(0, 2))) {
        this.people2(e, 2);
      } else if (SURNS_SET.has(cn[0])) {
        this.people2(e, 1);
      }
    }
  }
}

// ── Entry point ──────────────────────────────────────────────────────
/** Detect & replace person names on the `<i>` tokens of a cheerio document. */
export function applyNameEngine($: CheerioAPI): void {
  const els = $('i').toArray();
  if (els.length === 0) return;

  // Build token list with adjacency (consecutive <i> element siblings) and
  // a "space to the right" flag (immediate next sibling is whitespace text).
  const toks: Tok[] = [];
  const elIndex = new Map<unknown, number>();
  els.forEach((el, idx) => {
    elIndex.set(el, idx);
    toks.push({
      el,
      t: $(el).attr('t') || '',
      h: ($(el).attr('h') || '').toLowerCase(),
      v: $(el).attr('v') || '',
      p: $(el).attr('p') || '',
      text: $(el).text(),
      isname: $(el).attr('isname') === 'true',
      consumed: false,
      spaceRight: false,
      next: -1,
      prev: -1,
    });
  });

  // Resolve adjacency + spaceRight from the DOM sibling chain.
  type SibNode = {
    type: string;
    name?: string;
    data?: string;
    next: SibNode | null;
  };
  els.forEach((el, idx) => {
    let n: SibNode | null = (el as unknown as SibNode).next;
    let immediateSpace = false;
    let first = true;
    while (n) {
      if (n.type === 'text') {
        if (first && (!n.data || n.data.trim() === '')) immediateSpace = true;
        if (n.data && n.data.trim() !== '') break; // punctuation/word
        n = n.next;
        first = false;
        continue;
      }
      if (n.type === 'tag') {
        if (n.name === 'i' && elIndex.has(n)) {
          const j = elIndex.get(n)!;
          toks[idx].next = j;
          toks[j].prev = idx;
        }
        break;
      }
      n = n.next;
      first = false;
    }
    toks[idx].spaceRight = immediateSpace;
  });

  const engine = new NameEngine(toks);
  engine.run();

  // Write changes back to the DOM.
  for (const tok of toks) {
    if (tok.consumed) {
      $(tok.el as never).text('');
    } else if (tok.isname) {
      $(tok.el as never).text(tok.text);
      $(tok.el as never).attr('t', tok.t);
    }
  }
}
