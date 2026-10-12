// Campaign data and save handling are independent of rendering and audio.
const freeze = (value) => {
  for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item);
  return Object.freeze(value);
};

const carrier = (launchCount, hp, score) => ({
  name: `${launchCount}機搭載空母`, hp, speed: 1.65, score,
  attackInterval: 22, damage: 8, radius: 8.5, scale: 1.9, launchCount,
});
export const ENEMY_TYPES = freeze({
  destroyer: { name: '駆逐艦', hp: 4, speed: 2.9, score: 180, attackInterval: 14, damage: 5, radius: 4, scale: 1 },
  cruiser: { name: '巡洋艦', hp: 10, speed: 2.1, score: 420, attackInterval: 16, damage: 8, radius: 5.8, scale: 1.35 },
  battleship: { name: '戦艦', hp: 24, speed: 1.2, score: 900, attackInterval: 20, damage: 13, radius: 7.8, scale: 1.8 },
  carrier: carrier(9, 20, 1100),
  carrier3: carrier(9, 20, 1100),
  carrier5: carrier(15, 29, 1450),
  carrier10: carrier(30, 42, 2050),
  // One world unit represents 10 m. Depth is expressed in these units, too.
  submarine: { name: '潜水艦', hp: 9, speed: 2.0, score: 650, attackInterval: 17, damage: 14, radius: 3.2, scale: .9, depth: 5 },
});

const formation = (kinds, distance = 155, spacing = 39, depth = 5) => kinds.map((kind, index) => ({
  kind,
  x: (index - (kinds.length - 1) / 2) * spacing,
  z: -distance - Math.abs(index - (kinds.length - 1) / 2) * 9,
  ...(kind === 'submarine' ? { depth } : {}),
}));

const parts = [
  { id: 1, title: '第一部・菊花反攻', story: '架空世界の環洋大戦は末期を迎えていた。暁和国は秘密裏に建造した超弩級万能戦艦「朝日」を、最後の反攻作戦「菊花」に投入する。南天列島を守り、青蓮島から翠洋に連なる補給航路を奪還せよ。各海域を制圧すると暁和国の防衛圏が広がる。' },
  { id: 2, title: '第二部・南天への航路', story: '翠洋の制海権と制空権を取り戻した暁和国。しかし南方の島々には黎明合衆国の飛行場と補給基地が残っていた。朝日は火環海から珊瑚洋へ進み、南の海を再びつなぐ。敵空母は搭載機を増やし、深海には潜水艦隊が待ち伏せる。' },
  { id: 3, title: '第三部・帰還の傷跡', story: '朝日が南で戦う間、チーナ帝国の反攻が暁和国の西の海を脅かした。黎明合衆国との決戦を前に、背後の補給路を断たれるわけにはいかない。星環島から北上し、石門海峡と青凪海を確保せよ。傷ついた朝日は、母港「暁津」で修理と次世代兵装の改修を受ける。' },
  { id: 4, title: '第四部・北海の迂回', story: '暁津で改修を終えた朝日は、敵の正面防衛線を避けて氷霧の北海へ向かった。霜門海峡から双大陸海峡を抜け、中央洋の前進基地を制圧する。荒れる海、広域の潜水艦網、重空母群を突破し、敵本土へ続く最後の足場を築け。' },
  { id: 5, title: '第五部・夜明けの決戦', story: '朝日は黎明合衆国西岸へ到達した。白砂港の艦隊を破り、翡翠運河を通過して東の海へ進む。琥珀湾と東岸の補給都市を制圧し、合衆国中枢「白冠」を目指せ。ここまで奪還した海域と全兵装を力に、最後の主力艦隊を撃破し、長い環洋大戦に決着をつけるのだ。' },
];

// A fictional globe with Pacific-like relative positions. Every [lon, lat] is
// an in-world map coordinate; names do not identify real nations or cities.
export const WORLD = freeze({
  nations: [
    { id: 'akatsuwa', name: '暁和国', color: '#e7b662' },
    { id: 'union', name: '黎明合衆国', color: '#587a97' },
    { id: 'continental', name: 'チーナ帝国', color: '#887b91' },
    { id: 'southern', name: '南天諸邦', color: '#587f73' },
  ],
  parts,
  landmasses: [
    { id: 'east-mainland', nation: 'continental', name: '東方大陸', points: [[72,8],[78,23],[74,37],[85,53],[112,65],[143,62],[160,53],[151,44],[134,43],[127,36],[120,27],[111,21],[106,10],[100,5],[92,20],[84,9]] },
    { id: 'akatsuwa-islands', nation: 'akatsuwa', name: '暁和列島', points: [[129,31],[132,34],[135,35],[138,37],[140,41],[143,43],[145,45],[141,44],[139,40],[136,37],[133,35],[130,33]] },
    { id: 'southern-island', nation: 'southern', name: '青蓮島', points: [[120,21],[121,22],[122,25],[121,26],[120,24]] },
    { id: 'jade-islands', nation: 'southern', name: '翡翠群島', points: [[120,6],[123,7],[127,9],[126,13],[122,17],[120,14],[122,11]] },
    { id: 'fire-ring', nation: 'southern', name: '火環諸島', points: [[96,4],[103,-5],[113,-8],[126,-8],[135,-5],[128,-3],[118,-4],[109,-6],[103,-2],[100,3]] },
    { id: 'coral-mainland', nation: 'southern', name: '珊瑚大陸', points: [[113,-22],[116,-14],[128,-12],[137,-17],[145,-13],[153,-25],[150,-37],[136,-39],[128,-31],[115,-34]] },
    { id: 'dawn-islands', nation: 'southern', name: '暁珊島', points: [[136,-3],[145,-4],[154,-5],[151,-10],[145,-9],[139,-7]] },
    { id: 'western-federation', nation: 'union', name: '黎明合衆国大陸', points: [[-168,70],[-149,61],[-139,59],[-131,52],[-126,46],[-123,38],[-116,31],[-110,24],[-102,20],[-96,18],[-87,19],[-83,10],[-79,9],[-77,8],[-81,25],[-78,34],[-74,40],[-66,45],[-58,51],[-66,61],[-95,72],[-124,73]] },
    { id: 'south-federation', nation: 'union', name: '黎明南陸', points: [[-78,8],[-70,11],[-52,4],[-35,-6],[-42,-22],[-57,-38],[-69,-55],[-75,-39],[-80,-6]] },
  ],
  // Routes use area coordinates instead of this list when conquest is rendered.
  coordinateSystem: 'equirectangular', home: { lon: 132, lat: 34, name: '暁津軍港' },
  route: [[136,34],[129,27],[122,24],[126,11],[114,9],[104,1.4],[112,-6],[122,-2],[152,-4],[147,-9],[160,-8],[160,-10],[134,7],[145,13],[142,27],[118,24],[135,40],[132,34],[142,48],[148,44],[150,54],[178,59],[-177,28],[-157,21],[-119,34],[-80,9],[-74,17],[-91,25],[-95,29],[-81,24],[-65,32],[-73,40],[-74,40.7],[-76,37],[-77,38.9]],
});

const missions = [
  // part, name, lat, lon, encounter, equipment prerequisites, story objective
  [1,'菊花反攻作戦',34,136,'opening',{},'沈黙していた朝日が初出撃する。沿岸を封鎖する駆逐艦だけの2波を破り、南への出発点を確保せよ。'],
  [1,'南天列島防衛戦',27,129,'airstorm',{aa:1,special:2},'爆撃機120機が2波に分かれて来襲する。高角砲・龍神砲・蓄電槽を準備し、龍神弾を10単位積載せよ。各波で龍神砲を1回ずつ使用して防衛線を守れ。'],
  [1,'青蓮島沖海戦',24,122,'cruiser',{},'巡洋艦隊が狭い航路を守っている。徹甲弾を整え、南天列島と青蓮島を結ぶ補給線を回復せよ。'],
  [1,'翡翠湾海戦',11,126,'lightcarrier',{aa:1,radar:1},'湾口の軽空母は9機ずつ爆撃機を送り出す。遠距離レーダーで先手を取り、高角砲で航空攻撃を退けよ。'],
  [1,'翠洋制海戦',9,114,'submarine',{aa:1,sonar:1,asw:1},'翠洋では潜水艦が船団を待ち伏せる。パッシブソナーを作動させ、雷跡と探知位置から爆雷を投下せよ。'],
  [1,'海門港決戦',1.4,104,'mixed',{aa:1,radar:1,sonar:1,asw:1},'海門港の守備艦隊を突破し、第一防衛圏を完成させよ。航空攻撃と潜水艦の両方に備え、南天諸邦への補給拠点を確保する。'],
  [2,'火環海戦',-6,112,'battleship',{weapon:2,aa:1,sonar:1,asw:1},'火環海には重装甲戦艦が待つ。炸裂弾を用意し、敵の南方防衛線を崩せ。'],
  [2,'蒼火海戦',-2,122,'mediumcarrier',{aa:2,radar:1},'15機ずつ発艦する中型空母が接近する。高角砲と対空機関砲を併用し、艦隊の上空を守れ。'],
  [2,'朱礁港奪取戦',-4,152,'mediumsub',{aa:2,sonar:1,asw:2},'朱礁港を守る潜水艦隊を対潜魚雷で排除せよ。南方の艦隊補給と飛行場を取り戻す。'],
  [2,'珊瑚門奪取戦',-9,147,'deepmixed',{aa:2,sonar:2,asw:2},'珊瑚門へ近づく敵潜水艦をアクティブソナーで探知せよ。2000 m以内の位置が判明し、接近すると探信音が速くなる。'],
  [2,'碧環海戦',-8,160,'mediumcarrier',{aa:2,radar:1},'島々の間に展開する空母と護衛艦を撃破する。航空機を減らし、次の島への上陸航路を確保せよ。'],
  [2,'緑冠島奪取戦',-10,160,'heavycarrier',{aa:3,radar:1},'30機ずつ爆撃機を出す重空母が登場する。特殊対空弾を備え、南天の防衛圏を完成させよ。'],
  [3,'星環島転進',7,134,'heavycarrier',{aa:3,radar:2},'西の海でチーナ帝国が反攻を始めた。広域レーダーで重空母を捉え、帰還航路を切り開け。'],
  [3,'月門島攻略',13,145,'deepmixed',{aa:3,sonar:2,asw:2,radar:2},'月門島の哨戒線を突破する。航空攻撃を防ぎながら、暗い海の潜水艦を探知せよ。'],
  [3,'小暁諸島沖海戦',27,142,'homingsub',{aa:3,sonar:2,asw:3},'素早い潜水艦が帰還路を阻む。誘導対潜魚雷を用意し、回避する敵を追跡せよ。'],
  [3,'石門島の戦い',24,118,'battleship',{weapon:3,radar:2},'チーナ帝国の重装甲艦隊が石門海峡を塞ぐ。電磁砲の高速弾で防御線を突破し、背後の危機を除け。'],
  [3,'青凪海海戦',40,135,'homingsub',{aa:3,sonar:2,asw:3,radar:2},'青凪海の混成艦隊を撃破し、暁和本土の北西航路を回復せよ。艦隊と海中の脅威を同時に処理する。'],
  [3,'暁津軍港帰還',34,132,'mixed',{aa:3,sonar:2,asw:3,radar:2},'母港を封鎖する最後の艦隊を退ける。朝日を暁津へ帰還させ、損傷を修復し次世代兵装を解禁せよ。'],
  [4,'霜門海峡海戦',48,142,'battleship',{weapon:4,aa:3,radar:2},'修理と改修を終えた朝日は北の海峡へ向かう。光子主砲で霜門の重装甲戦艦を撃破せよ。'],
  [4,'霧岬沖海戦',44,148,'heavycarrier',{weapon:4,aa:3,radar:2},'冷たい霧の中、重空母が攻撃隊を送り出す。レーダーで遠距離の艦を捕捉し、対空砲で接近する爆撃機を迎え撃て。'],
  [4,'氷環海戦',54,150,'homingsub',{aa:3,sonar:2,asw:3,radar:2},'氷環海の潜水艦網を突破する。誘導対潜魚雷で離れた探知位置を攻撃し、北海の制海権を確保せよ。'],
  [4,'双大陸海峡海戦',59,178,'heavycarrier',{weapon:4,aa:3,radar:2},'世界を隔てる海峡に敵主力が集結した。補給を整え、中央洋へ抜ける出口を奪え。'],
  [4,'中央環礁海戦',28,-177,'deepmixed',{aa:3,radar:3,sonar:2,asw:3},'射撃管制とVT信管で高速の航空攻撃を迎え撃て。中央環礁を制圧し、敵本土への航路をつなぐ。'],
  [4,'陽冠諸島奪取戦',21,-157,'asroc',{weapon:4,aa:3,radar:3,sonar:3,asw:4},'陽冠諸島の深い海に潜水艦が潜む。哨戒機がソノブイを投下し、アスロックで遠方の海中目標を撃破せよ。'],
  [5,'白砂港攻撃',34,-119,'asroc',{weapon:4,aa:3,radar:3,sonar:3,asw:4},'黎明合衆国の西岸へ到達した。白砂港の艦隊を破り、敵大陸の補給拠点を確保せよ。'],
  [5,'翡翠運河通過',9,-80,'asroc',{aa:3,radar:3,sonar:3,asw:4},'狭い運河の両側から混成部隊が迫る。弾薬と燃料を十分に積み、東の海への通行権を確保する。'],
  [5,'紅帆海海戦',17,-74,'heavycarrier',{weapon:4,aa:3,radar:3},'紅帆海の重空母群を撃破せよ。敵航空隊は練度を増しており、射撃管制とVT信管が艦隊を支える。'],
  [5,'琥珀湾海戦',25,-91,'asroc',{aa:3,radar:3,sonar:3,asw:4},'琥珀湾に残る潜水艦隊を掃討する。ソノブイ網と遠距離対潜兵装で航路を安全にせよ。'],
  [5,'星炉港攻防戦',29,-95,'battleship',{weapon:4,aa:3,radar:3},'合衆国の造船と燃料補給を担う星炉港に敵戦艦が集結した。光子主砲で主力を打ち破れ。'],
  [5,'白帆海峡海戦',24,-81,'asroc',{aa:3,radar:3,sonar:3,asw:4},'白帆海峡の敵艦隊と潜水艦を同時に排除する。東岸へ向かう補給艦の道を開け。'],
  [5,'三月環礁海戦',32,-65,'heavycarrier',{weapon:4,aa:3,radar:3},'三月環礁の大航空隊が遠征艦隊を迎え撃つ。消耗を抑えて制空権を確保し、東岸の最終防衛線へ進め。'],
  [5,'天灯港沖海戦',40,-73,'asroc',{weapon:4,aa:3,radar:3,sonar:3,asw:4},'合衆国最大の港の沖で敵主力艦隊と対峙する。ソノブイで潜水艦を把握し、空海の防衛線を崩せ。'],
  [5,'天灯港奪取戦',40.7,-74,'heavycarrier',{weapon:4,aa:3,radar:3},'天灯港への進入路を守る重空母と戦艦を撃破する。港を確保し、長い遠征の補給線を完成させよ。'],
  [5,'青鐘湾海戦',37,-76,'asroc',{weapon:4,aa:3,radar:3,sonar:3,asw:4},'合衆国中枢の目前に最後の潜水艦防衛網が敷かれた。全兵装と補給を整え、青鐘湾を突破せよ。'],
  [5,'白冠争奪戦',38.9,-77,'final',{weapon:4,aa:3,radar:3,sonar:3,asw:4},'白冠への航路を守る最後の混成艦隊を撃破し、合衆国中枢の制海権を奪取せよ。すべての制圧海域が朝日の進路を支えている。夜明けを迎えるための最終出撃だ。'],
];

const encounters = {
  opening: [['destroyer','destroyer'], ['destroyer','destroyer','destroyer']],
  airstorm: [['destroyer','destroyer'], ['destroyer','cruiser','destroyer']],
  cruiser: [['destroyer','cruiser','destroyer'], ['cruiser','destroyer','cruiser']],
  lightcarrier: [['destroyer','carrier3','cruiser'], ['carrier3','cruiser','carrier3']],
  submarine: [['destroyer','submarine','cruiser'], ['submarine','carrier3','submarine']],
  mixed: [['cruiser','battleship','carrier3'], ['battleship','submarine','carrier3','cruiser']],
  battleship: [['cruiser','battleship','cruiser'], ['battleship','destroyer','battleship','cruiser']],
  mediumcarrier: [['cruiser','carrier5','destroyer'], ['carrier5','battleship','carrier5','cruiser']],
  mediumsub: [['submarine','cruiser','submarine'], ['carrier5','submarine','battleship','submarine']],
  deepmixed: [['submarine','carrier5','cruiser'], ['battleship','submarine','carrier5','submarine']],
  heavycarrier: [['cruiser','carrier10','battleship'], ['carrier10','battleship','carrier10','cruiser','battleship']],
  homingsub: [['submarine','carrier5','submarine'], ['submarine','battleship','carrier10','submarine']],
  asroc: [['submarine','carrier10','battleship','submarine'], ['battleship','submarine','carrier10','submarine','battleship']],
  final: [['carrier10','battleship','submarine','carrier10','battleship'], ['battleship','carrier10','submarine','carrier10','battleship']],
};

const landingAreas = new Set([6,9,10,12,14,16,18,24,25,29,33,35]);
const terrainAreas = new Map([[16,'strait'],[19,'strait'],[22,'strait'],[26,'canal'],[30,'strait']]);
const broadsideAreas = new Set([3,7,11,13,16,19,21,25,27,29,31,32]);
const crossingAreas = new Set([4,8,10,15,20,22,26,28,30,34]);
const weatherCycle = ['clear','cloudy','rain','clear','cloudy','rain','clear','storm'];
const shorelineTargets = (part, duration) => {
  const targets = [];
  for (let i=0;i<2+part;i++) targets.push({kind:'coastalBattery',x:(i-(1+part)/2)*18,y:4,z:-100-(i%2)*18,hp:8+part*7,score:180+part*70,damage:5+part*2,attackInterval:Math.max(3.5,10-part),radius:6});
  for (let i=0;i<1+part;i++) targets.push({kind:'tank',x:(i-part/2)*21,y:3,z:-142-(i%2)*13,hp:5+part*4,score:110+part*40,damage:2+part,attackInterval:8,radius:3.8,speed:.9+part*.18});
  for (let i=0;i<1+(part>=3?1:0);i++) targets.push({kind:'airfield',x:(i-.5)*100,y:2,z:-177,hp:18+part*12,score:450+part*140,launchCount:6+part*3,attackInterval:18,radius:12});
  return {duration,batteries:2+part,tanks:1+part,airfields:1+(part>=3?1:0),difficulty:1+(part-1)*.45,landingStrength:100,targets};
};

export const AREAS = freeze(missions.map(([part, name, lat, lon, encounter, required, originalBriefing], index) => {
  const id=index+1;
  const distance = encounter === 'opening' ? 145 : Math.min(400, 156 + index * 6);
  const depth = part < 3 ? 5 : part === 3 ? 8 : part === 4 ? 11 : 15;
  const terrain=terrainAreas.get(id)||'open';
  const isLanding=landingAreas.has(id);
  const requires={...required};
  if(id>=7)requires.gunPower=id>=25?3:id>=16?2:1;
  if(id>=8)requires.propeller=id>=25?3:id>=16?2:1;
  if(id>=9)requires.fuelTank=id>=29?3:id>=19?2:1;
  if(isLanding){
    requires.aa=Math.max(requires.aa||0,part>=2?2:1);
    requires.sonar=Math.max(requires.sonar||0,part>=3?2:1);
    requires.asw=Math.max(requires.asw||0,part>=4?4:part>=3?3:1);
  }
  const waves=encounters[encounter].map((kinds,wave)=>formation(kinds,distance+wave*24,44,depth));
  if(isLanding&& !waves.flat().some(e=>e.kind==='submarine')) waves[1].push({kind:'submarine',x:55,z:-distance-38,depth});
  const weatherName=id===1?'clear':weatherCycle[(index+part)%weatherCycle.length];
  const weather={timeOfDay:['dawn','day','night'][index%3],weather:weatherName,
    seaState:id===1?.35:Math.min(1.8,.4+part*.14+(weatherName==='storm'?.55:weatherName==='rain'?.25:0)),
    windX:id===1?.25:((index%7)-3)*(.4+part*.08),windZ:((index%5)-2)*.32};
  const bankDistance=terrain==='canal'?45:68;
  const terrainSpec=terrain==='open'?null:{bankDistance,bankWidth:75,bankHeight:terrain==='canal'?13:21,length:800,
    shoreBatteries:[-1,1].flatMap((side)=>[0,1,2].map(i=>({side:side<0?'port':'starboard',x:side*(bankDistance+8),z:-110-i*90,hp:15+part*7,score:220+part*80,damage:5+part*2,attackInterval:Math.max(4,10-part),activeAfter:18+i*4}))) };
  const shoreAssault=isLanding?shorelineTargets(part,130-part*12):null;
  const minefield=(isLanding||terrain!=='open'||[5,15,21,28,34].includes(id))
    ?{count:Math.min(18,4+part*2+(isLanding?2:0)),spacing:25,damage:12+part*3,drift:.25+part*.08}:null;
  const briefing=originalBriefing+(isLanding?' 海空潜水艦と機雷を排除後、上陸支援へ移る。上陸部隊到着までに砲台・戦車・飛行場を壊滅させ、部隊を砲撃から守れ。':'')
    +(terrain!=='open'?' 両岸には敵の陸上砲台があり、航行開始18秒後から砲撃を受ける。回避と岸への艦砲射撃が必要だ。':'');
  return {
    id,name,part,lat,lon,requires,briefing,weather,terrain,terrainSpec,shoreAssault,minefield,
    engagement:broadsideAreas.has(id)?'broadside':crossingAreas.has(id)?'crossing':'front',
    enemyScale:1+(part-1)*.44+(index%6)*.03,
    seaTint:[0x163642,0x123e4b,0x213642,0x172f40,0x17313b][part-1],
    fogTint:[0xa5b6c2,0x9eb4bf,0xb0adb0,0x9cabb8,0xc2b7a8][part-1],
    airRaid:encounter==='airstorm'?[60,60]:[0,0],
    requiredDragonUses:encounter==='airstorm'?2:0,waves,
    recommendations:{...requires,...(weatherName==='rain'?{radar:Math.min(3,Math.max(1,requires.radar||part-1))}:{}),...(id>=3?{reload:Math.min(3,Math.ceil(part/2)),armor:Math.min(3,Math.ceil(part/2))}:{})},
  };
}));

export const UPGRADES = freeze({
  weapon: [
    { kind: 'weapon', level: 1, name: '徹甲弾', description: '装甲を貫く砲弾。主砲の威力が上がる。', price: 650, unlockArea: 1 },
    { kind: 'weapon', level: 2, name: '炸裂弾', description: '大型艦向けの強化炸薬弾。第一部の終盤から準備できる。', price: 1450, unlockArea: 3 },
    { kind: 'weapon', level: 3, name: '電磁砲', description: '高速の電磁加速弾。第三部の重装甲艦に備える。', price: 3800, unlockArea: 12 },
    { kind: 'weapon', level: 4, name: '光子主砲', description: '光の砲弾を放つ最終主砲。母港帰還後に解禁される。', price: 6500, unlockArea: 19 },
  ],
  gunPower: [
    { kind:'gunPower',level:1,name:'主砲機構 I',description:'三連装主砲の砲身と駐退機を強化。主砲威力と射程を引き上げる。',price:700,unlockArea:3 },
    { kind:'gunPower',level:2,name:'主砲機構 II',description:'高圧砲身と安定装置。遠距離・並走戦での火力をさらに増す。',price:1700,unlockArea:13 },
    { kind:'gunPower',level:3,name:'主砲機構 III',description:'最終砲身機構。風と波のある決戦で長距離火力を支える。',price:3300,unlockArea:23 },
  ],
  fuelTank: [
    { kind:'fuelTank',level:1,name:'燃料庫 I',description:'燃料の最大積載量を2000から3000へ拡大。長時間の作戦に備える。',price:600,unlockArea:7 },
    { kind:'fuelTank',level:2,name:'燃料庫 II',description:'燃料の最大積載量を4500へ拡大。海峡と上陸支援の長期戦向け。',price:1300,unlockArea:17 },
    { kind:'fuelTank',level:3,name:'燃料庫 III',description:'燃料の最大積載量を6500へ拡大。最終部の連続戦闘を支える。',price:2400,unlockArea:27 },
  ],
  propeller: [
    { kind:'propeller',level:1,name:'スクリュー I',description:'速度と回避の復帰を強化。並走する敵艦と魚雷への備え。',price:650,unlockArea:5 },
    { kind:'propeller',level:2,name:'スクリュー II',description:'推進力を増し、回避行動の移動距離と再使用間隔を改善。',price:1500,unlockArea:13 },
    { kind:'propeller',level:3,name:'スクリュー III',description:'最終推進器。航空・魚雷攻撃を避ける急転舵を支える。',price:2900,unlockArea:23 },
  ],
  reload: [
    { kind: 'reload', level: 1, name: '給弾機構 I', description: '3門すべての装填時間を短縮する。', price: 400, unlockArea: 1 },
    { kind: 'reload', level: 2, name: '給弾機構 II', description: '高速給弾で砲撃の間隔をさらに短縮する。', price: 850, unlockArea: 7 },
    { kind: 'reload', level: 3, name: '給弾機構 III', description: '最終給弾機構。連続砲撃を支える。', price: 1500, unlockArea: 13 },
  ],
  armor: [
    { kind: 'armor', level: 1, name: '追加装甲 I', description: '船体耐久を増やし、反撃への備えを強める。', price: 450, unlockArea: 1 },
    { kind: 'armor', level: 2, name: '追加装甲 II', description: '複合装甲で船体耐久をさらに増やす。', price: 950, unlockArea: 7 },
    { kind: 'armor', level: 3, name: '追加装甲 III', description: '最終防御区画。決戦の砲火に耐える。', price: 1800, unlockArea: 13 },
  ],
  special: [
    { kind: 'special', level: 1, name: '龍神砲', description: '3門の出力を収束し、出現中の海上の敵艦と航空機を一掃する。龍神弾5単位を消費。出撃ごとに1回。潜水艦には対潜兵装が必要。', price: 2000, unlockArea: 2 },
    { kind: 'special', level: 2, name: '龍神砲・蓄電槽', description: '一度の出撃で最大2回使用可能。南天列島防衛戦では各波で1回ずつ使う。龍神弾が必要。', price: 1500, unlockArea: 2 },
  ],
  aa: [
    { kind: 'aa', level: 1, name: '高角砲', description: '中・長距離の爆撃機を手動射撃で迎撃する。対空弾を消費。', price: 600, unlockArea: 2 },
    { kind: 'aa', level: 2, name: '対空機関砲', description: '高角砲に近距離の連射砲を追加し、接近機を迎撃する。', price: 1800, unlockArea: 5 },
    { kind: 'aa', level: 3, name: '特殊対空弾', description: '強化した対空弾で大航空隊に対抗する。射撃管制のVT信管と組み合わせると範囲攻撃になる。', price: 3200, unlockArea: 11 },
  ],
  radar: [
    { kind: 'radar', level: 1, name: '遠距離レーダー', description: '砲撃可能な距離を延長し、遠方の敵艦を捕捉する。', price: 900, unlockArea: 3 },
    { kind: 'radar', level: 2, name: '広域レーダー', description: '広域索敵と砲撃距離を延長し、距離・速度情報で遠距離の見越し射撃を助ける。雨では有効範囲が0.7倍。', price: 2200, unlockArea: 12 },
    { kind: 'radar', level: 3, name: '射撃管制・VT信管', description: '射撃を補正し、対空弾が航空機の近くで爆発する近接信管を解禁する。', price: 4800, unlockArea: 22 },
  ],
  sonar: [
    { kind: 'sonar', level: 1, name: 'パッシブソナー', description: 'ソナーONで潜水艦を探知。静粛運転のため主砲の装填時間は2倍になる。', price: 1300, unlockArea: 4 },
    { kind: 'sonar', level: 2, name: 'アクティブソナー', description: '2000 m以内の潜水艦位置を表示。接近するほど探信音が速くなる。', price: 2600, unlockArea: 9 },
    { kind: 'sonar', level: 3, name: 'ソノブイ哨戒機', description: '哨戒機がソノブイを投下し、距離を問わず潜水艦の位置を把握する。', price: 4200, unlockArea: 23 },
  ],
  asw: [
    { kind: 'asw', level: 1, name: '爆雷投射機', description: '指定位置に爆雷を投下し、数秒後に爆発。位置と深度の差で与える損害が変わる。', price: 1200, unlockArea: 4 },
    { kind: 'asw', level: 2, name: '直進対潜魚雷', description: '発射時の目標位置へ直線で進む対潜魚雷。対潜弾を消費。', price: 2200, unlockArea: 8 },
    { kind: 'asw', level: 3, name: '誘導対潜魚雷', description: '探知中の潜水艦を追うホーミング魚雷。回避する敵に有効。', price: 3400, unlockArea: 14 },
    { kind: 'asw', level: 4, name: 'アスロック', description: 'ロケットで遠方へ対潜魚雷を届ける最終対潜兵装。', price: 5200, unlockArea: 23 },
  ],
});

export const CONSUMABLES = freeze({
  shell: { kind: 'shell', name: '主砲弾', price: 240, amount: 150 },
  aa: { kind: 'aa', name: '対空弾', price: 260, amount: 300 },
  asw: { kind: 'asw', name: '対潜弾', price: 450, amount: 30 },
  dragon: { kind: 'dragon', name: '龍神弾', price: 550, amount: 5 },
  fuel: { kind: 'fuel', name: '燃料', price: 180, amount: 600 },
});

const SAVE_KEY = 'asahi-cannon-campaign-v2';
const LEGACY_SAVE_KEY = 'asahi-cannon-campaign-v1';
const KINDS = Object.keys(UPGRADES);
const SUPPLY_KINDS = Object.keys(CONSUMABLES);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const objectLike = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const bounded = (value, low, high, fallback = low) => Math.max(low, Math.min(high, finite(value, fallback)));
const integer = (value, low, high, fallback = low) => Math.floor(bounded(value, low, high, fallback));
export const CONSUMPTION_MULTIPLIER=5;
export const DAMAGE_ZONES=freeze(['bow','stern','port','starboard','bridge','engine']);
const FUEL_CAPACITIES=[2000,3000,4500,6500];
const initialZones=()=>Object.fromEntries(DAMAGE_ZONES.map(kind=>[kind,0]));
const initialStock = () => ({ shell:180,aa:240,asw:30,dragon:0,fuel:900 });
const OLD_UNLOCKS = { weapon:[1,2,3,4], reload:[1,2,4], armor:[1,2,4], special:[5] };
const freshState = () => ({
  version: 3, credits: 1200, unlockedArea: 1, conquered: [],
  upgrades: Object.fromEntries(KINDS.map((kind) => [kind,0])), stock:initialStock(),records:{},legacyUpgrades:{},hull:100,damageZones:initialZones(),
});

function validateState(source) {
  const state = freshState();
  if (!objectLike(source) || ![1,2,3].includes(source.version)) return state;
  const migrated = source.version === 1;
  state.credits = integer(source.credits, 0, 1e9);
  // The one-time conversion grant equips returning captains for consumable play.
  if (migrated) state.credits = Math.max(6000, state.credits);
  state.unlockedArea = integer(source.unlockedArea, 1, migrated ? 6 : AREAS.length);
  if (Array.isArray(source.conquered)) {
    state.conquered = [...new Set(source.conquered.filter((value) => Number.isInteger(value) && value >= 1 && value <= (migrated ? 6 : AREAS.length)))].sort((a,b) => a-b);
    for (const id of state.conquered) state.unlockedArea = Math.max(state.unlockedArea, Math.min(AREAS.length,id+1));
  }
  if (objectLike(source.upgrades)) {
    for (const kind of KINDS) {
      if (!own(source.upgrades,kind)) continue;
      let level = integer(source.upgrades[kind],0,UPGRADES[kind].length);
      // Existing v1 equipment is retained even if its new unlock milestone moved.
      if (migrated) {
        if (!own(OLD_UNLOCKS,kind)) level=0;
        else {
          level=Math.min(level,OLD_UNLOCKS[kind].length);
          while (level > 0 && OLD_UNLOCKS[kind][level-1] > state.unlockedArea) level--;
          state.legacyUpgrades[kind]=level;
        }
      } else {
        const legacy = objectLike(source.legacyUpgrades) && own(OLD_UNLOCKS,kind) && own(source.legacyUpgrades,kind)
          ? integer(source.legacyUpgrades[kind],0,OLD_UNLOCKS[kind].length) : 0;
        let validLegacy=legacy;
        while (validLegacy > 0 && OLD_UNLOCKS[kind][validLegacy-1] > state.unlockedArea) validLegacy--;
        if (validLegacy) state.legacyUpgrades[kind]=validLegacy;
        while (level > validLegacy && UPGRADES[kind][level-1].unlockArea > state.unlockedArea) level--;
      }
      state.upgrades[kind] = level;
    }
  }
  if (!migrated && objectLike(source.stock)) {
    for (const kind of SUPPLY_KINDS) state.stock[kind] = own(source.stock,kind) ? Math.min(999999,integer(source.stock[kind],0,999999)*(source.version===2?5:1)) : 0;
  }
  if (migrated && state.upgrades.special > 0) state.stock.dragon=10;
  state.stock.fuel=Math.min(FUEL_CAPACITIES[state.upgrades.fuelTank],state.stock.fuel);
  if(source.version===3){
    state.hull=bounded(source.hull,0,100,100);
    if(objectLike(source.damageZones))for(const kind of DAMAGE_ZONES)state.damageZones[kind]=bounded(source.damageZones[kind],0,100);
    if(objectLike(source.damageZones)&&own(source.damageZones,'deck'))state.damageZones.bridge=Math.max(state.damageZones.bridge,bounded(source.damageZones.deck,0,100));
  }
  if (objectLike(source.records)) {
    for (const area of AREAS) {
      const key = String(area.id);
      if (!own(source.records,key) || !objectLike(source.records[key])) continue;
      const record = source.records[key];
      state.records[key] = {
        bestScore: integer(record.bestScore,0,1e9),
        bestAccuracy: Math.round(bounded(record.bestAccuracy,0,100)*10)/10,
        bestTime: bounded(record.bestTime,0,86400), victories: integer(record.victories,0,1e6),
        rank: ['S','A','B','C','D'].includes(record.rank) ? record.rank : 'D',
      };
    }
  }
  return state;
}

export class CampaignStore {
  constructor(storage) {
    this.storage = null;
    this._state = freshState();
    try {
      this.storage = storage === undefined ? globalThis.localStorage : storage;
      const saved = this.storage?.getItem(SAVE_KEY) || this.storage?.getItem(LEGACY_SAVE_KEY);
      if (saved) {
        const decoded = JSON.parse(saved);
        this._state = validateState(decoded);
        if ([1,2].includes(decoded?.version))this.save();
      }
    } catch { /* Memory-only progress remains playable. */ }
  }

  get state() { return this._state; }
  save() {
    this._state = validateState(this._state);
    try { this.storage?.setItem(SAVE_KEY,JSON.stringify(this._state)); } catch { /* Storage can be unavailable. */ }
  }
  get nextUpgradeKinds() { return KINDS.slice(); }
  nextUpgrade(kind) {
    if (!KINDS.includes(kind)) return null;
    const upgrade = UPGRADES[kind][integer(this._state.upgrades[kind],0,UPGRADES[kind].length)];
    return upgrade ? { ...upgrade } : null;
  }
  canBuy(kind) {
    const upgrade = this.nextUpgrade(kind);
    return Boolean(upgrade && this._state.unlockedArea >= upgrade.unlockArea && this._state.credits >= upgrade.price);
  }
  buy(kind) {
    const upgrade = this.nextUpgrade(kind);
    if (!upgrade) return { ok:false, reason:KINDS.includes(kind) ? '最大まで強化済みです。' : '不明なパーツです。', upgrade:null };
    if (this._state.unlockedArea < upgrade.unlockArea) return { ok:false, reason:`第${upgrade.unlockArea}海域の解放後に購入できます。`, upgrade };
    if (this._state.credits < upgrade.price) return { ok:false, reason:'資金が不足しています。制圧済み海域への再出撃でも資金を獲得できます。', upgrade };
    this._state.credits -= upgrade.price;
    this._state.upgrades[kind] = upgrade.level;
    this.save();
    return { ok:true, reason:`${upgrade.name}を装備しました。`, upgrade };
  }

  fuelCapacity() { return FUEL_CAPACITIES[this._state.upgrades.fuelTank] || FUEL_CAPACITIES[0]; }

  buySupply(kind) {
    if (!SUPPLY_KINDS.includes(kind)) return {ok:false,reason:'不明な補給品です。',supply:null};
    const supply=CONSUMABLES[kind],limit=kind==='fuel'?this.fuelCapacity():999999;
    if(this._state.stock[kind]>=limit)return {ok:false,reason:kind==='fuel'?'燃料庫は満杯です。容量を増やすには燃料庫を強化してください。':'積載量が上限です。',supply:{...supply}};
    const amount=Math.min(supply.amount,limit-this._state.stock[kind]);
    const cost=Math.ceil(supply.price*amount/supply.amount);
    if(this._state.credits<cost)return {ok:false,reason:'補給資金が不足しています。制圧済み海域への再出撃で補給費を確保できます。',supply:{...supply,amount,price:cost}};
    this._state.credits-=cost;
    this._state.stock[kind]+=amount;
    this.save();
    return {ok:true,reason:`${supply.name}を${amount}単位補給しました。`,supply:{...supply,amount,price:cost}};
  }

  setHullCondition(percent,zones={}) {
    this._state.hull=bounded(percent,0,100,100);
    for(const kind of DAMAGE_ZONES)if(objectLike(zones)&&own(zones,kind))this._state.damageZones[kind]=bounded(zones[kind],0,100);
    this.save();
    return {hull:this._state.hull,damageZones:{...this._state.damageZones}};
  }

  repairQuote() {
    const damage=100-this._state.hull;
    const zoneDamage=Object.values(this._state.damageZones).reduce((sum,n)=>sum+n,0);
    const cost=Math.ceil(damage*(5+this._state.upgrades.armor)+zoneDamage*1.5);
    return {cost,damage,hull:this._state.hull,targetHull:100,zones:{...this._state.damageZones}};
  }

  repairHull() {
    const quote=this.repairQuote();
    if(!quote.cost)return {ok:false,reason:'船体は修復済みです。',cost:0};
    if(this._state.credits<quote.cost)return {ok:false,reason:`修理には${quote.cost} C必要です。資金不足時は緊急復帰を利用できます。`,cost:quote.cost};
    this._state.credits-=quote.cost;
    this._state.hull=100;
    this._state.damageZones=initialZones();
    this.save();
    return {ok:true,reason:'船体と損傷部位を修復しました。',cost:quote.cost};
  }

  canEmergencyResupply() {
    // The relief dock restores only a first-area retry. It never supplies the
    // advanced ammunition needed to bypass later loadout requirements.
    const minimum={shell:150,fuel:900},stock=this._state.stock;
    const needRepair=this._state.hull<65||Object.values(this._state.damageZones).some(n=>n>35);
    const needSupply=stock.shell<minimum.shell||stock.fuel<minimum.fuel;
    if(!needRepair&&!needSupply)return {ok:false,reason:'第1海域へ再挑戦する船体と補給は整っています。通常の修理・補給を利用してください。'};
    const supplyCost=Object.entries(minimum).reduce((total,[kind,amount])=>{
      const supply=CONSUMABLES[kind];
      return total+Math.ceil(Math.max(0,amount-stock[kind])/supply.amount)*supply.price;
    },0);
    const repairCost=needRepair?this.repairQuote().cost:0;
    if(this._state.credits>=supplyCost+repairCost)return {ok:false,reason:`通常の修理・補給費は${supplyCost+repairCost} Cです。保有資金で準備できます。`};
    return {ok:true,reason:'緊急復帰を受けられます。船体65%以上・主砲弾150単位・燃料900を最低量として、第1海域へ再挑戦できます。'};
  }

  emergencyResupply() {
    const check=this.canEmergencyResupply();
    if(!check.ok)return check;
    this._state.stock.shell=Math.max(150,this._state.stock.shell);
    this._state.stock.fuel=Math.max(900,this._state.stock.fuel);
    this._state.hull=Math.max(65,this._state.hull);
    for(const kind of DAMAGE_ZONES)this._state.damageZones[kind]=Math.min(35,this._state.damageZones[kind]);
    this.save();
    return {ok:true,reason:'緊急復帰完了。応急修理・主砲弾・燃料を受領しました。第1海域で資金を立て直してください。'};
  }

  consume(kind,n=1) {
    if(!SUPPLY_KINDS.includes(kind)||!Number.isInteger(n)||n<1)return false;
    const cost=n*CONSUMPTION_MULTIPLIER;
    if(this._state.stock[kind]<cost)return false;
    this._state.stock[kind]-=cost;
    // Fuel is continuous; checkpoints perform the durable save.
    return true;
  }

  requirements(areaId) {
    const area=AREAS[areaId-1];
    if(!area)return {};
    const requirements={...area.requires},fleet=area.waves.flat();
    const hasAircraft=area.airRaid.some(count=>count>0)||fleet.some(enemy=>(ENEMY_TYPES[enemy.kind].launchCount||0)>0)||Boolean(area.shoreAssault?.airfields);
    const hasSubmarine=fleet.some(enemy=>enemy.kind==='submarine');
    if(hasAircraft)requirements.aa=Math.max(1,requirements.aa||0);
    if(hasSubmarine){requirements.sonar=Math.max(1,requirements.sonar||0);requirements.asw=Math.max(1,requirements.asw||0);}
    return requirements;
  }

  canDeploy(areaId) {
    if(!Number.isInteger(areaId)||areaId<1||areaId>AREAS.length)return {ok:false,reason:'不明な海域です。'};
    if(areaId>this._state.unlockedArea)return {ok:false,reason:'前の海域を制圧して航路を開いてください。'};
    if(this._state.hull<35)return {ok:false,reason:'船体の損傷が大きく出撃できません。港で修理し、船体状態35%以上にしてください。'};
    const area=AREAS[areaId-1],requirements=this.requirements(areaId),fleet=area.waves.flat();
    const hasAircraft=Boolean(requirements.aa),hasSubmarine=fleet.some(enemy=>enemy.kind==='submarine');
    const missing=Object.entries(requirements).filter(([kind,level])=>this._state.upgrades[kind]<level).map(([kind,level])=>UPGRADES[kind][level-1].name);
    if(missing.length)return {ok:false,reason:`必須兵装：${missing.join('・')}を港で準備してください。${hasSubmarine?'潜水艦にはソナーと対潜兵装が必要です。':hasAircraft?'航空隊には対空兵装が必要です。':''}`,missing:requirements};
    const stock=this._state.stock;
    if(stock.shell<30)return {ok:false,reason:'主砲弾を30単位以上補給してください。1発で5単位を消費します。'};
    if(stock.fuel<100)return {ok:false,reason:'燃料を100以上補給してください。通常航行は毎秒5を消費します。'};
    if(hasAircraft&&stock.aa<100)return {ok:false,reason:'航空隊に備えて対空弾を100単位以上補給してください。'};
    if(hasSubmarine&&stock.asw<15)return {ok:false,reason:'潜水艦に備えて対潜弾を15単位以上補給してください。'};
    const dragonRequired=area.requiredDragonUses*CONSUMPTION_MULTIPLIER;
    if(stock.dragon<dragonRequired)return {ok:false,reason:`この作戦には龍神弾が${dragonRequired}単位必要です。龍神砲1射で5単位を消費します。`};
    return {ok:true,reason:'兵装・船体・補給を確認しました。出撃可能です。'};
  }

  settle(areaId,stats={},won=false) {
    const id = integer(areaId,1,AREAS.length), area = AREAS[id-1];
    const input = objectLike(stats) ? stats : {};
    const fleet = area.waves.flat();
    const kills = integer(input.kills,0,fleet.length);
    // Aviation kills are displayed separately and never inflate the fleet score.
    const airKills = integer(input.airKills,0,100000);
    const shots = integer(input.shots,0,100000), hits = integer(input.hits,0,shots);
    const time = bounded(input.time,0,86400), hull = bounded(input.hull,0,100);
    const accuracy = shots > 0 ? Math.round(hits/shots*1000)/10 : 0;
    const fullFleetScore = fleet.reduce((sum,enemy) => sum+ENEMY_TYPES[enemy.kind].score,0);
    const sunkScore = Math.round(typeof input.killScore === 'number' && Number.isFinite(input.killScore)
      ? bounded(input.killScore,0,fullFleetScore) : fullFleetScore*kills/fleet.length);
    const victory = won === true;
    const aimBonus = shots > 0 ? Math.round(accuracy*6) : 0;
    const survivalBonus = victory ? Math.round(hull*3) : 0;
    const timeBonus = victory ? Math.max(0,Math.round(450-time*1.5)) : 0;
    const shoreTargets=[...(area.shoreAssault?.targets||[]),...(area.terrainSpec?.shoreBatteries||[])];
    const fullShoreScore=shoreTargets.reduce((sum,t)=>sum+t.score,0);
    const shoreKills=integer(input.shoreKills,0,shoreTargets.length);
    const shoreScore=integer(input.shoreScore,0,fullShoreScore,shoreTargets.length?Math.round(fullShoreScore*shoreKills/shoreTargets.length):0);
    const score=sunkScore+shoreScore+Math.min(900,airKills*4)+aimBonus+survivalBonus+timeBonus;
    const firstClear = victory && !this._state.conquered.includes(id);
    const rank = victory ? (accuracy >= 75 && hull >= 50 ? 'S' : accuracy >= 50 ? 'A' : accuracy >= 25 ? 'B' : 'C') : 'D';
    // First clear funds the next mission's prerequisites. Replays sustain supplies.
    const clearBonus=id===1?6000:2300+area.part*700+(id%6)*130+(area.shoreAssault?700:0);
    const reward=victory?Math.max(600,Math.round(score*(firstClear?(id===1?.4:.28):.22)+clearBonus*(firstClear?1:.35))):0;
    this._state.credits = Math.min(1e9,this._state.credits+reward);
    if (victory) {
      if (firstClear) this._state.conquered.push(id);
      this._state.conquered.sort((a,b) => a-b);
      this._state.unlockedArea = Math.max(this._state.unlockedArea,Math.min(AREAS.length,id+1));
      const previous = this._state.records[String(id)], rankOrder = ['D','C','B','A','S'];
      this._state.records[String(id)] = {
        bestScore:Math.max(previous?.bestScore || 0,score), bestAccuracy:Math.max(previous?.bestAccuracy || 0,accuracy),
        bestTime:previous?.victories > 0 ? Math.min(previous.bestTime,time) : time,
        victories:Math.min(1e6,(previous?.victories || 0)+1),
        rank:rankOrder.indexOf(previous?.rank) > rankOrder.indexOf(rank) ? previous.rank : rank,
      };
    }
    this.save();
    return {score,reward,accuracy,rank,firstClear,credits:this._state.credits,airKills,shoreKills,shoreScore,landingIntegrity:bounded(input.landingIntegrity,0,100,100)};
  }

  reset() { this._state=freshState(); this.save(); return this._state; }
}
