/* CAMEO 酒令派对 · 中英文切换
 * 方案：词典(中文原文→英文) + 全文档文本节点替换 + MutationObserver 自动翻译动态渲染的内容。
 * 切换按钮：游戏主页左上角「EN/中」；语言存 localStorage('jl_lang')。
 * 词典没覆盖到的文案保持中文显示，不会报错不会破版。
 */
(function(){
  var LANG = 'zh';
  try { LANG = localStorage.getItem('jl_lang') || 'zh'; } catch(e){}

  var I18N = {
    /* ===== 通用/线路 ===== */
    '店里极速':'LAN Fast', '云端':'Cloud', '版本 v':'Version v',
    '· 店内极速':'· LAN Fast', '· 云端':'· Cloud',
    '需连店内 WiFi 联机':'Needs store WiFi to play online',
    '网络异常，稍后再试':'Network hiccup, try again shortly', '网络异常':'Network error',
    '无效操作':'Invalid action', '操作失败':'Action failed', '设置失败':'Failed to set',
    '指定失败':'Failed to assign', '转盘失败':'Wheel error', '开局失败':'Failed to start',
    '重新开始失败，请再点一次':'Restart failed, tap again', '已重新开始 · 第 1 轮':'Restarted · Round 1',
    '先加入派对才能邀请':'Join the party first to invite',
    '邀请链接已复制，去微信发给朋友吧 📋':'Invite link copied — send it to friends on WeChat 📋',
    '邀请链接已复制，去微信粘贴给好友吧 📋':'Invite link copied — paste it to friends on WeChat 📋',
    '复制失败':'Copy failed', '复制失败，房间号：':'Copy failed. Room code:',
    '手机流量只能单人玩 · 连店里 WiFi 才能和同桌联机':'On mobile data you play solo · connect store WiFi to play with your table',
    '已回到本桌派对 🍻':'Back at your table party 🍻', '已退出派对':'Left the party', '已移出派对':'You were removed from the party',
    '踢人失败':'Failed to remove player', '已加入':'Joined', '进局 🍻':'Join the game 🍻',
    '确定退出本桌派对？':'Leave this table party?',
    '已拉':'in', '最多 10 人':'Max 10 players', '至少留 2 个人':'Keep at least 2 players',
    '新成员名字：':'New member name:', '改名字：':'Rename:', '（我）':' (me)', '杯':' cups',
    '桌 · 派对成员（':' · Party members (', '人）':' players)', '人':' players',
    '喝 ':'Drank ', ' · 参与':' · Rounds ',
    ' · 踢出✕':' · Remove✕', '点上方头像指定':'Tap an avatar above to assign',
    '请输入桌号（桌上二维码上写着，如 D1）：':'Enter table number (printed on the table QR code, e.g. D1):',
    '加入失败，请重试':'Join failed, please retry', '先给自己起个名字':'Pick a name first',
    '来加入我们这桌的酒令派对！（':'Join our table for the CAMEO Drinking Party! (',
    '桌）':' table)', 'CAMEO酒令派对 · 谁是卧底':'CAMEO Party · Who Is the Spy',
    '来我的谁是卧底房间，房间号':'Come to my Spy room, code ',
    'CAMEO酒令派对':'CAMEO Drinking Party', '酒令派对':'Party', '扫码点歌':'Song Request',
    '看你的点数':' to see your dice',
    '已最大化 · 手机横过来举着 📱↔️':'Maximized · hold your phone sideways 📱↔️',

    /* ===== 首页/游戏主页 ===== */
    '开一局？':'Start a game?', '云端 7×24 在线 · 电脑关机也能玩':'Cloud online 24/7 · works even when the PC is off',
    '号桌':' table', '同桌的人会自动进同一个派对':'People at your table auto-join the same party',
    '⚡ 已连上店里 WiFi · 进入极速版':'⚡ Store WiFi connected · Enter LAN Fast Mode',
    '店内局域网直连，快 50 倍 · 点一点就切换':'Direct LAN connection, 50× faster · tap to switch',
    '⚡ 点此进入店内极速版':'⚡ Tap to enter LAN Fast Mode',
    '⚡ 一键进入店内极速版':'⚡ One tap to LAN Fast Mode',
    '连店里 WiFi 快 50 倍 · 探测成功会自动切，没切就点一下':'50× faster on store WiFi · auto-switches if detected, or tap here',
    '店里 WiFi 下快 50 倍 · 自动没切就手动点一下':'50× faster on store WiFi · tap here if it did not switch automatically',
    '⚡ 已连上店里 WiFi · 正在切换极速版…':'⚡ Store WiFi connected · switching to LAN Fast…',
    '桌号自动带上，马上就好':'Your table number is carried over — one moment',
    '在店里？点此进入店内极速版（快 50 倍）→':'In the store? Enter LAN Fast Mode (50× faster) →',
    '出门用流量？打开线上版 →':'On mobile data? Open the online version →',
    '随时可玩':'Play anytime', '店内可用':'In-store',
    '女巫的毒药 · 天命轮盘 · 大话骰 · 谁是卧底':'Witch\u2019s Poison · Fate Wheel · Liar\u2019s Dice · Who Is the Spy',
    '扫同一张码的人自动同房，动作全桌同步':'Same QR = same room, actions sync across the table',
    '搜歌点播 · 生日祝福上大屏':'Song requests · birthday shoutouts on the big screen',
    '连店里 WiFi 即点即播，画面秒上电视':'On store WiFi, instant playback on TV',
    '没连上店里服务 · 连上店内 WiFi 后再点':'Store server not reachable · connect to store WiFi and try again',
    '扫同一张桌卡的人自动进同一桌派对':'Everyone scanning the same table card joins the same party',
    '第一个进来的是房主 · 可以邀请微信好友':'First to join is the host · can invite WeChat friends',
    '打开线上版 →':'Open online version →',
    '🍻 已开始记录':'🍻 Recording started', '未登录模式 · 不记录数据':'Guest mode · no stats recorded',
    '微信已绑定 · 数据实时记录':'WeChat linked · stats recording live', '登录后自动记录':'Sign in to auto-record',
    '未登录':'Guest', '微信登录':'WeChat Sign-in', '授权中…':'Authorizing…',
    '微信用户一键登录':'One-tap WeChat Sign-in',
    '登录 CAMEO酒令派对':'Sign in to CAMEO Party',
    '登录后记录你喝的每一杯<br>和微信好友比拼喝酒排行榜':'Record every drink after sign-in<br>compete with WeChat friends on the leaderboard',
    '欢迎，':'Welcome, ',
    '本周':'This week', '本周战绩 · 继续':'This week · keep going', '微信好友':'WeChat friends',
    '参与':'Rounds', '轮 · 中毒':'R · poisoned', '存活率':'Survival', '共转':'Spins', '次 · 中弹':' · hits',
    '幸免率':'Dodged', '局 · 险胜':'games · close wins', '胜率':'Win rate',
    '🟢 已绑定微信 · 好友数据实时同步（原型为模拟数据）':'🟢 WeChat linked · friend stats sync live (demo data)',
    '⚪ 未登录 · 登录后与微信好友同台比拼':'⚪ Guest · sign in to compete with WeChat friends',

    /* ===== 主页卡片 ===== */
    '🍺 啤酒局':'🍺 Beer Round', '快乐水':'Soda', '🥤 饮料局（无酒精）':'🥤 Soft Drinks (no alcohol)',
    '天命轮盘':'Fate Wheel', '🎲 摇骰子':'🎲 Roll Dice', '摇骰子':'Roll Dice', '谁是卧底':'Who Is the Spy',
    '女巫的毒药':'Witch\u2019s Poison', '手持弹幕':'Handheld Banner', '夜店爆闪':'Club Strobe',
    '开房组队 · 抓卧底':'Build a room · find the spy',
    '举起来 · 让全场看到':'Hold it up · let everyone see',
    '本局':'This game', '人 · 成员到齐了吗？点「开局」马上开始':' players. Ready? Tap Start to begin',
    '人 · 成员到齐就点开局':' players. Tap Start when everyone is in',
    '派对正在玩「':'Party is playing \u201c', '」· 点「开局」切换到「':'\u201d · tap Start to switch to \u201c',
    '📢 先点「▶ 开局」开始':'📢 Tap \u201c▶ Start\u201d first',
    '成员到齐后，点开局马上开始':'When everyone is in, tap Start to begin',
    '▶ 开局':'▶ Start', '▶ 开始游戏（发词）':'▶ Start Game (deal words)',
    '福利盲盒':'Mystery Box', '我的成就':'Achievements',

    /* ===== 大话骰 ===== */
    '大话骰 · 各摇各的 · 已摇 ':'Liar\u2019s Dice · everyone rolls their own · rolled ',
    '点「摇」或晃一晃手机':'Tap Roll or shake your phone',
    '↑ 上滑开盅 · ↓ 下滑盖上':'↑ Swipe up to open · ↓ swipe down to cover',
    '↑ 上滑开盅 看你的点数':'↑ Swipe up to see your dice',
    '↓ 下滑盖上 · 等 others 开盅':'↓ Cover · wait for others to open',
    '上滑开盅':'Swipe up to open', '下滑盖上':'Swipe down to cover',
    '摇骰子按钮':'Roll button', '🎉':'🎉',
    '网络卡了一下，请再摇一次':'Network lagged — please roll again',
    '开盅！':'Open!', '再摇一次':'Roll again', '摇骰中…':'Rolling…',

    /* ===== 女巫的毒药 ===== */
    '请设置毒药（其他人别偷看）':'Set the poison (others, no peeking)',
    '中毒了！':'Poisoned!', '点击翻牌':'Tap to flip', '正在指定':'Assigning…', '结果已出':'Result is in',
    '轮 · 点击一个图标设为毒药（其他人别偷看）':'R · tap an icon to set the poison (others, no peeking)',
    '轮 · 轮流点击，点中毒药的人喝！已翻':'R · take turns tapping; whoever taps poison drinks! Flipped ',
    '轮 · 轮到你了':'R · your turn', '📢 请设置毒药！':'📢 Set the poison!',
    '吃下了毒药，愿赌服输～':' drank the poison — a deal is a deal~',
    '有人':'Someone', '继续 · 下一瓶毒药':'Continue · next poison',
    '毒药已设置，传给下一位！':'Poison set — pass it on!',
    '还没轮到你，等':'Not your turn yet — wait for ', '别人':'others',
    '设置毒药':'Set poison', '图标已换：':'Icon changed: ', '数量已改为':'Count changed to ',

    /* ===== 天命轮盘 ===== */
    '转动轮盘':'Spin the wheel', '开始转动！':'Spin it!', '转…':'Spinning…',
    '🎯 转出了 ':'🎯 Landed on ', ' · 点一个人':' · pick someone',
    '没人可指定 · 点这里自己喝':'No one to assign · tap here to drink yourself',
    '等 ':'waiting for ', ' 指定一个人…':' to pick someone…',
    '派对里暂时没有其他人':'No one else in the party yet',
    '（再点一下继续转）':'(tap again to keep spinning)', '（到你啦）':'(your turn)',
    '编辑轮盘项目（最多 8 字）：':'Edit wheel item (max 8 chars):',
    '→ PASS · 免罚':'→ PASS · no penalty', '→ 再转一次！':'→ Spin again!',
    '再转一次':'Spin again',

    /* ===== 谁是卧底 ===== */
    '谁是卧底要 3 人以上联机 · 连店里 WiFi 才能开':'Spy needs 3+ players online · connect store WiFi to play',
    '👀 查看我的词语':'👀 View my word', '🔄 重新分配词语':'🔄 Redistribute words',
    '重新分配失败，再点一次':'Redistribute failed, tap again',
    '谁是卧底至少要 3 人，先邀请伙伴':'Spy needs 3+ players — invite friends first',
    '建房中…':'Creating room…', '创建房间':'Create Room', '建房失败，请重试':'Create failed, please retry',
    '进房失败，请重试':'Join failed, please retry', '进房失败':'Join failed',
    '房间开好了，点「邀请」发给朋友 🎉':'Room ready — tap Invite to send to friends 🎉',
    '· 房号':'· Room code', '🔒 本房间有密码':'🔒 Room has a password', '🔓 无密码 · 扫码即可进入':'🔓 No password · just scan to enter',
    '至少 3 人才能开局（1 卧底 + 2 平民）':'Need 3+ players to start (1 spy + 2 civilians)',
    '已进入房间，等房主开始游戏…':'In the room — waiting for host to start…',
    '这个房间有密码，请输入：':'This room has a password, enter it:',
    '平票！没人出局，继续描述':'Tie! No one is out — keep describing',
    '上一轮：':'Last round: ', '被投出局，他':' was voted out — he ', '就是卧底！':'was the spy!', '是平民…':'was a civilian…',
    '每人一句话描述自己的词，说完开始投票':'Each person describes their word in one sentence, then we vote',
    '⚠️ 刚才平票，没人出局，继续描述！':'⚠️ Tie vote — nobody out, keep describing!',
    '描述完了，开始投票':'Done describing — start voting', '等房主发起投票…':'Waiting for host to start the vote…',
    '点一个人，把他投出去':'Tap someone to vote them out',
    '你已投票，等其他人…':'Vote cast — waiting for others…', '你已出局，观战中…':'You are out — spectating…',
    '🎉 平民获胜！':'🎉 Civilians win!', '🕵️ 卧底获胜！':'🕵️ Spy wins!',
    '平民词「':'Civilian word: \u201c', '」 · 卧底词「':'\u201d · Spy word: \u201c',
    '本局玩家':'Players this game', '再来一局（重新发词）':'Play again (redeal words)',
    '等房主开下一局…':'Waiting for host to start next game…',
    '🏠 开新房间（房主）':'🏠 Open a new room (host)', '🚪 加入房间（扫码后这里能看到开的房）':'🚪 Join a room (rooms appear here after scanning)',
    '暂时没有开着的房间，扫桌面二维码后等别人建房，或自己开一个':'No open rooms — scan a table QR and wait for someone to open one, or start your own',
    '词由服务器偷偷发':'words are dealt secretly by the server',
    '不用再建房间啦 —— 上方点「▶ 开局」，<br>派对里所有人一起玩，词由服务器偷偷发。':'No room needed — tap \u201c▶ Start\u201d above,<br>the whole party plays together, words dealt secretly.',

    /* ===== 真心话（心动问题） ===== */
    '在座谁最让你心跳加速？当场指出来':'Who here makes your heart race? Point them out now',
    '说出你最近一次失眠是因为想到了谁':'Who were you thinking of during your last sleepless night?',
    '你觉得在座哪一对最有夫妻相？':'Which pair here looks most like a couple?',
    '你的理想型是外表派还是灵魂派？为什么':'Looks or soul — your ideal type? Why',
    '说出一个你藏了很久、从没告诉过别人的心动瞬间':'Share a moment of attraction you\u2019ve hidden for a long time',
    '在座的人里你最想和谁去旅行？只能选一个':'Who here would you most want to travel with? Pick one',
    '你最近偷偷看过谁的社交主页？看了多久':'Whose social profile did you secretly stalk recently? For how long',
    '说出你最想收到哪种类型的告白':'What kind of confession do you most want to receive?',
    '你觉得在座谁最会撩人？现场表演一下':'Who here is the best flirt? Demonstrate live',
    '如果必须和在座一人被困电梯 3 小时，你选谁':'If trapped 3 hours in an elevator with one person here, who?',
    '你的初恋现在还有联系吗？最后一句说的是什么':'Still in touch with your first love? What was the last thing you said',
    '说出一个你至今后悔没说出口的话':'Say something you still regret never saying',
    '你相过亲或被相亲过吗？最离谱的一次是什么样':'Ever been on a blind date? The most ridiculous one',
    '在座谁第一眼最不像好人？为什么':'Who looks least trustworthy at first glance? Why',
    '你最想在什么场景下脱单？描述一下画面':'In what scenario would you most want to find love? Describe it',
    '说出你手机里最不敢让人翻的聊天备注名':'Reveal the chat nickname on your phone you\u2019d least want seen',
    '如果明天是世界末日，今晚你想和谁过？':'If tomorrow is doomsday, who do you spend tonight with?',
    '你被表白过最难忘的一次是哪种场面':'The most unforgettable way someone confessed to you',
    '你觉得在座谁的酒品最好？谁的最差':'Who here has the best drinking manners? The worst?',
    '说出一个你单曲循环超过 100 遍的情歌，唱两句':'Name a love song you\u2019ve replayed 100+ times — sing a bit',
    '在座的人里，你私底下偷偷比较过谁和谁？比较了什么':'Who here have you secretly compared, and on what?',
    '你有过暧昧到差点在一起的瞬间吗？说细节':'Ever had a moment that almost became romance? Give details',
    '说出你最想和在座谁单独喝一杯到天亮':'Who here would you most want to drink with till sunrise?',
    '你觉得在座谁吻起来最有安全感？说理由':'Who here would be the safest kisser? Explain',
    '你的上一段心动是怎么结束的？谁先退的':'How did your last crush end? Who backed off first',
    '在座谁最符合你对「一夜」的一切想象？说三个特征':'Who here best matches your wildest imagination? Name 3 traits',
    '你为心动的人做过最越界的事是什么':'The most over-the-line thing you\u2019ve done for someone you like',
    '如果只能亲在座一人一下，你亲谁？当众指出来':'If you could kiss one person here, who? Point them out',
    '说出你最想被谁壁咚，为什么':'Who would you most want pinned against a wall by? Why',
    '你和谁聊到过深夜三点以后？聊的什么':'Who have you chatted with past 3am? About what',

    /* ===== 大冒险（上头任务） ===== */
    '和左边的玩家对视 10 秒，谁先笑谁喝':'Stare into the left player\u2019s eyes 10s; first to laugh drinks',
    '让右边的人给你起一个肉麻外号，本轮大家都要这么叫你':'Let the person on your right give you a cheesy nickname everyone must use this round',
    '用最温柔的声音对在座一人说「晚安」':'Whisper \u201cgoodnight\u201d to someone here in your softest voice',
    '在座任意两人十指相扣 5 秒':'Any two players here: interlock fingers for 5 seconds',
    '和你对面的人合唱一句情歌':'Sing a line of a love song with the person across from you',
    '闭眼让在座一人喂你吃一口东西，猜是谁喂的':'Close your eyes, let someone feed you a bite, guess who',
    '对在座一人深情朗读一段土味情话':'Read a cheesy pickup line to someone here with deep feeling',
    '模仿偶像剧告白场面，对象由大家指定':'Reenact a drama confession scene — target chosen by the group',
    '让在座一人在你手心写一个字，猜错喝':'Someone writes a character on your palm; guess wrong and drink',
    '和被指定的人贴贴拍照，表情要甜蜜':'Take a cuddly photo with the assigned person, sweetest smile required',
    '用气声对麦克风说一句撩人的话':'Say a flirty line into the mic in a breathy voice',
    '选一人和你对唱情歌对唱段，眼神要拉丝':'Pick someone to sing a duet with — eye contact mandatory',
    '让大家在你手背上亲一个「章」（唇印贴纸代替）':'Let everyone stamp a \u201ckiss seal\u201d on your hand (sticker will do)',
    '给在座一人当 3 分钟专属服务员，称呼「殿下」':'Serve one player for 3 minutes, addressing them as \u201cYour Highness\u201d',
    '闭眼转三圈，转完指到谁就和谁对视 5 秒':'Spin 3 times with eyes closed; lock eyes 5s with whoever you point at',
    '和你右边的人玩「对视前倾」：互相靠近直到其中一人先躲开':'Play \u201cleaning stare\u201d with your right neighbor: lean in until one of you backs off',
    '让在座一人在你耳边说一句悄悄话，内容你俩自己定':'Let someone whisper a secret in your ear — content up to you two',
    '选一人和你背贴背 10 秒，谁先动谁喝':'Stand back-to-back with someone 10s; first to move drinks',
    '用嘴叼起一张卡片，传给下一位玩家':'Pick up a card with your mouth and pass it to the next player',
    '和你最想Close的人现场还原偶像剧「摔倒互抱」名场面':'Recreate the famous \u201ctripping into each other\u2019s arms\u201d scene with the one you like',
    '让在座投票选出「最想和你被困荒岛的人」并当众公布':'Have everyone vote \u201cwho\u2019d be stranded on an island with you\u201d and announce it',
    '给通讯录第 3 位发「今晚月色真美」，等回复':'Text the 3rd contact \u201cthe moonlight is lovely tonight\u201d and wait',
    '和在座一人互相喂一口东西，全程对视不许笑':'Feed each other a bite with someone, eye contact, no laughing',
    '选一人给你化妆/涂口红（闭眼全程）':'Let someone do your makeup/lipstick (eyes closed throughout)',
    '抱起在座一人转半圈（量力而行，换牵手绕场一周也可）':'Lift and half-spin someone (or hold hands and circle the room)',
    '奶茶三分甜':'30% Sugar Milk Tea', '老张不喝酒':'Teetotaler Zhang', '大聪明':'Big Brain',
    '微醺的猫':'Tipsy Cat', '天亮就睡':'Sleep At Dawn', '深夜酒精研究所':'Midnight Alcohol Lab',
    '今晚不回家':'Not Going Home Tonight', '蹦迪小王子':'Clubbing Prince', '爱心 Cocktail':'Love Cocktail',
    '一两就倒':'One Shot Knockout', '老张':'Zhang', '小美':'Mei', '阿强':'Qiang', '琳琳':'Lin',

    /* ===== 氛围音效 ===== */
    '掌声':'Applause', '全场鼓掌':'Crowd claps', '欢呼':'Cheer', '人群+口哨':'Crowd + whistle',
    '哄堂大笑':'Roaring laughter', '哈哈哈哈哈':'Hahahahaha', '悲伤小号':'Sad Trumpet',
    '鼓点':'Drum roll', '滚奏+镲':'Roll + crash', '喝倒彩':'Boo', '尴尬冷场':'Awkward silence',
    '蟋蟀在叫…':'Crickets chirping…', '空气喇叭':'Air horn', '扰民神器':'Noise machine',
    '金币暴击':'Coin crit', '恐怖惊悚':'Horror sting', '登登登——':'Dun dun dun—',
    '嘿！':'Hey!', '短促有力':'Short and punchy', '哈！':'Ha!', '哈哈哈的哈':'A hearty ha',
    '咦？':'Huh?', '疑惑上扬':'Confused rising', '哇！':'Wow!', '🎉':'🎉',

    /* ===== 盲盒/成就 ===== */
    '老板再来一打！':'Boss, another round!', '蹦起来！':'Jump!', '一起摇！':'Shake together!',
    '精酿一杯':'Craft beer ×1', '到吧台出示本页，免费换一杯':'Show this page at the bar for a free one',
    '特调鸡尾酒':'Signature cocktail', '限今晚使用':'Tonight only',
    '免罚券 ×1':'Skip-drink voucher ×1', '本轮可以免喝一次':'Skip one drink this round',
    '指定权 ×1':'Assign voucher ×1', '指定任意一人喝一杯':'Make anyone drink one',
    '小食拼盘':'Snack platter', '到吧台直接领取':'Pick up directly at the bar',
    '再来一次':'Spin again', '今天还能再开一次盲盒':'You can still open a box today',
    '已开':'Opened', '今天已经开过啦，明天再来':'Already opened today — come back tomorrow',
    '开盲盒':'Open Box', '今天的手气':'Today\u2019s luck', '今日福利盲盒':'Daily Mystery Box',
    '今天已经开过了，明天再来 🎁':'Already opened today, back tomorrow 🎁',
    '开箱中…':'Opening…', '恭喜开出':'Congrats! You got ', '🎉 开出「':'🎉 You got \u201c',
    '盲盒奖励要绑定微信才能核销<br>不然吧台没法确认是不是你':'Box rewards need WeChat sign-in to redeem<br>otherwise the bar can\u2019t verify it\u2019s you',
    '加入派对要绑定微信<br>这样每局战绩都会记到你头上':'Joining a party needs WeChat sign-in<br>so every round counts toward your stats',
    '成就按你的战绩自动累计<br>登录后数据跟着微信走':'Achievements build up from your games<br>sign in to keep them with your WeChat',
    '登录后开盲盒':'Sign in to open boxes', '登录后加入派对':'Sign in to join party', '登录后看成就':'Sign in to view achievements',

    '初次登场':'First Blood', '完成 1 局酒令游戏':'Finish 1 party game',
    '酒局常客':'Regular', '累计参与 10 局':'Join 10 games',
    '千杯不醉':'Iron Liver', '累计喝掉 20 杯':'Drink 20 cups total',
    '毒药幸存者':'Poison Survivor', '玩 5 轮女巫的毒药':'Play 5 rounds of Witch\u2019s Poison',
    '天选之人':'Chosen One', '转 10 次天命轮盘':'Spin the Fate Wheel 10 times',
    '骰王':'Dice King', '摇骰子险胜 5 局':'Win 5 close Liar\u2019s Dice games',
    '盲盒达人':'Box Addict', '开 3 次福利盲盒':'Open 3 mystery boxes',
    '局中之王':'Game Champion', '获胜 10 次':'Win 10 times',
    '登录后才有成就记录':'Sign in to record achievements',
    '已解锁':'Unlocked', '🏅 已解锁':'🏅 Unlocked', '个成就':' achievements',

    /* ===== 点歌/其他 ===== */
    '老板，上骰子':'Boss, dice please',
    '（无）':'(none)', '：':': '
  };

  function escKey(k){ return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var keys = Object.keys(I18N).sort(function(a,b){ return b.length - a.length; });
  var RE = new RegExp(keys.map(escKey).join('|'), 'g');

  function tr(s){
    if (LANG !== 'en') return s;
    if (s.indexOf('\u4e00') < 0 && !/[\u4e00-\u9fff]/.test(s)) return s;
    return s.replace(RE, function(m){ return I18N[m]; });
  }

  var LOCK = false;
  var CJK = /[\u4e00-\u9fff]/;
  function walk(root){
    if (LANG !== 'en' || !root) return;
    try {
      if (root.nodeType === 3){           /* 文本节点 */
        if (CJK.test(root.nodeValue)){
          var nt = tr(root.nodeValue);
          if (nt !== root.nodeValue){
            if (root.__zhV === undefined) root.__zhV = root.nodeValue;   /* 记住原文，切回中文时还原 */
            root.nodeValue = nt;
          }
        }
        return;
      }
      if (root.nodeType !== 1) return;
      var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n;
      while ((n = w.nextNode())){
        if (CJK.test(n.nodeValue)){
          var t2 = tr(n.nodeValue);
          if (t2 !== n.nodeValue){
            if (n.__zhV === undefined) n.__zhV = n.nodeValue;
            n.nodeValue = t2;
          }
        }
      }
      /* 常用属性 */
      var all = root.querySelectorAll('[title],[placeholder],[aria-label]');
      for (var i = 0; i < all.length; i++){
        var el = all[i];
        ['title','placeholder','aria-label'].forEach(function(a){
          var v = el.getAttribute && el.getAttribute(a);
          if (v && CJK.test(v)){
            var nv = tr(v);
            if (nv !== v){
              if (!el.__zhA) el.__zhA = {};
              if (el.__zhA[a] === undefined) el.__zhA[a] = v;
              el.setAttribute(a, nv);
            }
          }
        });
      }
    } catch(e){}
  }

  /* 切回中文：把缓存的原文还原回去 */
  function restoreZh(){
    try {
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
      while ((n = w.nextNode())){
        if (n.__zhV !== undefined){ n.nodeValue = n.__zhV; delete n.__zhV; }
      }
      var all = document.querySelectorAll('[title],[placeholder],[aria-label]');
      for (var i = 0; i < all.length; i++){
        var el = all[i], A = el.__zhA;
        if (!A) continue;
        Object.keys(A).forEach(function(a){ el.setAttribute(a, A[a]); });
        delete el.__zhA;
      }
    } catch(e){}
  }

  function applyAll(){
    if (LANG !== 'en') return;
    LOCK = true;
    walk(document.body);
    LOCK = false;
    try {
      var h = document.title;
      if (CJK.test(h)) document.title = tr(h);
    } catch(e){}
  }

  /* 动态内容：任何新增/修改的节点自动翻译 */
  function observe(){
    if (!window.MutationObserver) return;
    new MutationObserver(function(muts){
      if (LANG !== 'en' || LOCK) return;
      LOCK = true;
      for (var i = 0; i < muts.length; i++){
        var mu = muts[i];
        if (mu.type === 'characterData'){ walk(mu.target); }
        for (var j = 0; j < mu.addedNodes.length; j++){ walk(mu.addedNodes[j]); }
      }
      LOCK = false;
    }).observe(document.body || document.documentElement, { childList:true, subtree:true, characterData:true });
  }

  function toggle(){
    var to = LANG === 'en' ? 'zh' : 'en';
    if (to === 'zh'){ LANG = 'zh'; try { localStorage.setItem('jl_lang', 'zh'); } catch(e){} restoreZh(); updateBtns(); return LANG; }
    LANG = 'en';
    try { localStorage.setItem('jl_lang', 'en'); } catch(e){}
    applyAll();
    updateBtns();
    return LANG;
  }

  function updateBtns(){
    var list = document.querySelectorAll('.langbtn');
    for (var i = 0; i < list.length; i++){
      list[i].textContent = LANG === 'en' ? '中' : 'EN';
      list[i].title = LANG === 'en' ? '切换到中文' : 'Switch to English';
    }
  }

  function boot(){
    observe();
    updateBtns();
    if (LANG === 'en') applyAll();
    document.addEventListener('click', function(ev){
      var el = ev.target;
      while (el && el !== document.body){
        if (el.classList && el.classList.contains('langbtn')){ ev.preventDefault(); ev.stopPropagation(); toggle(); return; }
        el = el.parentNode;
      }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.JLI18N = { toggle: toggle, lang: function(){ return LANG; }, tr: tr };
})();
