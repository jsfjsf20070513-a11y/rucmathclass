// 每日阅读样稿（GPT 写正文与题目，讲解按「词：解释」整理）。正式上线后改由 Worker 每天生成，本文件只作页面开发与截图用。
export const lectureSamples = [
  {
    "date": "2026-11-18",
    "level": "B1",
    "exam": "DELF",
    "title": "Mon panier du jeudi",
    "paragraphs": [
      "Pendant longtemps, je quittais le bureau juste au moment où le marché fermait. Depuis septembre, je commande un panier de légumes en ligne et je le récupère chez la fleuriste en rentrant du travail. Le jeudi après-midi, un maraîcher du coin y dépose ses paniers. On a jusqu’au mardi soir pour commander, mais c’est le maraîcher qui choisit les légumes.",
      "La première fois, je suis tombée sur deux gros navets au fond de mon panier. Comme je ne savais pas quoi en faire, la fleuriste m’a donné sa recette de soupe. À mon tour, je laisse parfois une recette sur le comptoir pour les autres clients.",
      "Les jeudis où je finis trop tard, ma voisine passe à ma place. Il lui suffit de donner mon nom à la fleuriste."
    ],
    "questions": [
      {
        "stem": "Pourquoi la cliente a-t-elle commencé à commander ses légumes en ligne ?",
        "options": [
          {
            "key": "A",
            "text": "Le marché se trouvait trop loin de son bureau."
          },
          {
            "key": "B",
            "text": "Ses horaires de travail l’empêchaient d’aller au marché à temps."
          },
          {
            "key": "C",
            "text": "Sa voisine lui avait recommandé ce service."
          }
        ],
        "answer": "B",
        "evidence": [
          "je quittais le bureau juste au moment où le marché fermait"
        ]
      },
      {
        "stem": "Les clients choisissent eux-mêmes les légumes de leur panier.",
        "options": [
          {
            "key": "Vrai",
            "text": "Vrai"
          },
          {
            "key": "Faux",
            "text": "Faux"
          }
        ],
        "note": "Justifiez votre réponse en citant un passage du texte.",
        "answer": "Faux",
        "evidence": [
          "c’est le maraîcher qui choisit les légumes"
        ]
      },
      {
        "stem": "Que doit faire la voisine pour retirer le panier ?",
        "options": [
          {
            "key": "A",
            "text": "Indiquer le nom de la cliente."
          },
          {
            "key": "B",
            "text": "Montrer une confirmation de commande."
          },
          {
            "key": "C",
            "text": "Prévenir le maraîcher avant de venir."
          }
        ],
        "answer": "A",
        "evidence": [
          "Il lui suffit de donner mon nom à la fleuriste."
        ]
      }
    ],
    "titleNote": {
      "zh": "我每周四的那篮菜",
      "points": [
        {
          "term": "panier",
          "note": "阳性名词，篮子。这里指按篮订的一篮菜。"
        },
        {
          "term": "du jeudi",
          "note": "= de + le jeudi，每周四的。"
        }
      ]
    },
    "sentences": [
      {
        "fr": "Pendant longtemps, je quittais le bureau juste au moment où le marché fermait.",
        "zh": "有好长一段时间，我下班离开办公室时，集市正好收摊。",
        "points": [
          {
            "term": "pendant longtemps",
            "note": "很长一段时间。"
          },
          {
            "term": "quittais（quitter）",
            "note": "离开。用未完成过去时，说的是那段日子天天如此。",
            "star": true
          },
          {
            "term": "bureau",
            "note": "阳性名词，办公室。"
          },
          {
            "term": "juste au moment où",
            "note": "恰好在……的时候。",
            "star": true
          },
          {
            "term": "marché",
            "note": "阳性名词，集市。"
          },
          {
            "term": "fermait（fermer）",
            "note": "关门、收摊。"
          }
        ]
      },
      {
        "fr": "Depuis septembre, je commande un panier de légumes en ligne et je le récupère chez la fleuriste en rentrant du travail.",
        "zh": "从九月起，我一直在网上订菜，下班回家时顺路到花店取。",
        "points": [
          {
            "term": "depuis + 起点 + 现在时",
            "note": "从那时起一直如此。",
            "star": true
          },
          {
            "term": "commande（commander）",
            "note": "订购。"
          },
          {
            "term": "légume",
            "note": "阳性名词，蔬菜。"
          },
          {
            "term": "en ligne",
            "note": "在网上。"
          },
          {
            "term": "le",
            "note": "代替前面的 un panier de légumes，放在动词前。",
            "star": true
          },
          {
            "term": "récupère（récupérer）",
            "note": "领取、取回。"
          },
          {
            "term": "chez la fleuriste",
            "note": "在花店。chez + 人，表示在某人那里。"
          },
          {
            "term": "en rentrant du travail",
            "note": "下班回家的路上。en + 现在分词，表示两件事同时发生。",
            "star": true
          }
        ]
      },
      {
        "fr": "Le jeudi après-midi, un maraîcher du coin y dépose ses paniers.",
        "zh": "每周四下午，附近一位菜农都会把一篮篮菜送到那家花店。",
        "points": [
          {
            "term": "le jeudi",
            "note": "加上 le，意思是每周四。",
            "star": true
          },
          {
            "term": "après-midi",
            "note": "阳性或阴性名词都可以，下午。"
          },
          {
            "term": "maraîcher",
            "note": "阳性名词，菜农。"
          },
          {
            "term": "du coin",
            "note": "附近的、这一带的。"
          },
          {
            "term": "y",
            "note": "代替上一句的地点 chez la fleuriste。",
            "star": true
          },
          {
            "term": "dépose（déposer）",
            "note": "放下、送到。"
          }
        ]
      },
      {
        "fr": "On a jusqu’au mardi soir pour commander, mais c’est le maraîcher qui choisit les légumes.",
        "zh": "最迟周二晚上还能下单，不过篮子里装哪些菜，由菜农决定。",
        "points": [
          {
            "term": "on",
            "note": "泛指大家，这里指订菜的人。"
          },
          {
            "term": "avoir jusqu’à … pour + 动词原形",
            "note": "在……之前都可以做某事，说的是截止时间。",
            "star": true
          },
          {
            "term": "jusqu’au",
            "note": "= jusqu’à + le。"
          },
          {
            "term": "soir",
            "note": "阳性名词，晚上。"
          },
          {
            "term": "c’est … qui …",
            "note": "强调句，突出是谁做这件事。",
            "star": true
          },
          {
            "term": "choisit（choisir）",
            "note": "挑选。"
          }
        ]
      },
      {
        "fr": "La première fois, je suis tombée sur deux gros navets au fond de mon panier.",
        "zh": "头一回取菜，我在篮底意外发现了两个大芜菁。",
        "points": [
          {
            "term": "la première fois",
            "note": "第一次。fois 是阴性名词，所以用 première。"
          },
          {
            "term": "tomber sur",
            "note": "偶然碰到。",
            "star": true
          },
          {
            "term": "suis tombée",
            "note": "tomber 的复合过去时用 être。说话人是女性，过去分词加 e。",
            "star": true
          },
          {
            "term": "gros",
            "note": "大的、个头大。"
          },
          {
            "term": "navet",
            "note": "阳性名词，芜菁，一种根菜。"
          },
          {
            "term": "au fond de",
            "note": "在……底部。fond 是阳性名词。"
          }
        ]
      },
      {
        "fr": "Comme je ne savais pas quoi en faire, la fleuriste m’a donné sa recette de soupe.",
        "zh": "我正发愁这些芜菁该怎么吃，花店那位女士就把她做汤的方子给了我。",
        "points": [
          {
            "term": "comme",
            "note": "放在句首，意思是因为。",
            "star": true
          },
          {
            "term": "savais（savoir）",
            "note": "知道。未完成过去时，写当时的状态。"
          },
          {
            "term": "ne pas savoir quoi faire de qch",
            "note": "不知道拿某物怎么办。",
            "star": true
          },
          {
            "term": "en",
            "note": "代替 de ces navets。",
            "star": true
          },
          {
            "term": "m’a donné（donner）",
            "note": "给了我。"
          },
          {
            "term": "recette",
            "note": "阴性名词，菜谱、做法。"
          },
          {
            "term": "soupe",
            "note": "阴性名词，汤。"
          }
        ]
      },
      {
        "fr": "À mon tour, je laisse parfois une recette sur le comptoir pour les autres clients.",
        "zh": "我有时也会在柜台上留一张食谱，给别的顾客看。",
        "points": [
          {
            "term": "à mon tour",
            "note": "轮到我，我也照样做。",
            "star": true
          },
          {
            "term": "laisse（laisser）",
            "note": "留下。"
          },
          {
            "term": "parfois",
            "note": "有时。"
          },
          {
            "term": "comptoir",
            "note": "阳性名词，柜台。"
          },
          {
            "term": "client",
            "note": "阳性名词，顾客。"
          }
        ]
      },
      {
        "fr": "Les jeudis où je finis trop tard, ma voisine passe à ma place.",
        "zh": "有的周四我下班太晚，邻居就替我去取。",
        "points": [
          {
            "term": "les jeudis où",
            "note": "……的那些周四。où 跟在时间后面，引出那天发生的事。",
            "star": true
          },
          {
            "term": "finis（finir）",
            "note": "结束，这里指下班。"
          },
          {
            "term": "trop tard",
            "note": "太晚。"
          },
          {
            "term": "voisine",
            "note": "阴性名词，女邻居。"
          },
          {
            "term": "passe（passer）",
            "note": "去一趟。"
          },
          {
            "term": "à ma place",
            "note": "代替我。",
            "star": true
          }
        ]
      },
      {
        "fr": "Il lui suffit de donner mon nom à la fleuriste.",
        "zh": "她只要向花店那位女士报出我的名字就行。",
        "points": [
          {
            "term": "il suffit de + 动词原形",
            "note": "只要……就行。",
            "star": true
          },
          {
            "term": "lui",
            "note": "指上一句的邻居，对她来说。"
          },
          {
            "term": "nom",
            "note": "阳性名词，名字。"
          }
        ]
      }
    ],
    "takeaways": [
      {
        "term": "depuis + 现在时",
        "note": "从过去某时一直持续到现在。"
      },
      {
        "term": "y / en",
        "note": "y 代替地点，en 代替 de + 东西。"
      },
      {
        "term": "c’est … qui …",
        "note": "强调是谁。"
      },
      {
        "term": "il suffit de",
        "note": "只要……就够了。"
      }
    ]
  },
  {
    "date": "2026-11-19",
    "level": "B1",
    "exam": "TEF",
    "title": "Le port, photo en main",
    "paragraphs": [
      "À l’office de tourisme, demandez la pochette qui contient six photos anciennes du port. Le jeu consiste à retrouver l’endroit exact d’où chaque photo a été prise. Sur la place, une horloge vous aidera par exemple à reconnaître l’ancienne poste, devenue un café. Au dos de la photo, une habitante raconte son premier jour de travail derrière le guichet.",
      "Les étapes ne sont pas numérotées et vous pouvez les parcourir dans l’ordre qui vous plaît. Comptez une bonne heure pour la balade, un peu plus si vous aimez prendre des photos. Le prêt est gratuit, mais pensez à rendre la pochette le jour même, avant la fermeture de l’office à dix-huit heures.",
      "S’il pleut, vous pouvez vous installer dans la petite salle de lecture, juste à côté de l’accueil. Vous y trouverez un grand plan du port pour situer les bâtiments sans sortir."
    ],
    "questions": [
      {
        "stem": "Quel est le but de cette balade ?",
        "options": [
          {
            "key": "A",
            "text": "Classer les photos du port selon leur date."
          },
          {
            "key": "B",
            "text": "Faire le portrait des habitants du port."
          },
          {
            "key": "C",
            "text": "Retrouver les lieux de prise de vue."
          },
          {
            "key": "D",
            "text": "Choisir les images d’une future exposition."
          }
        ],
        "answer": "C",
        "evidence": [
          "Le jeu consiste à retrouver l’endroit exact d’où chaque photo a été prise."
        ]
      },
      {
        "stem": "Quelle consigne les visiteurs doivent-ils respecter ?",
        "options": [
          {
            "key": "A",
            "text": "Rendre la pochette le jour de l’emprunt."
          },
          {
            "key": "B",
            "text": "Commencer par la place de l’ancienne poste."
          },
          {
            "key": "C",
            "text": "Finir la balade en une heure exactement."
          },
          {
            "key": "D",
            "text": "Réserver les photos la veille de la visite."
          }
        ],
        "answer": "A",
        "evidence": [
          "pensez à rendre la pochette le jour même"
        ]
      },
      {
        "stem": "En cas de pluie, l’office propose aux visiteurs de…",
        "options": [
          {
            "key": "A",
            "text": "rencontrer l’habitante qui a travaillé à la poste."
          },
          {
            "key": "B",
            "text": "faire la visite en ligne depuis chez eux."
          },
          {
            "key": "C",
            "text": "rapporter la pochette le lendemain."
          },
          {
            "key": "D",
            "text": "repérer les bâtiments sur un plan dans la salle de lecture."
          }
        ],
        "answer": "D",
        "evidence": [
          "Vous y trouverez un grand plan du port pour situer les bâtiments sans sortir."
        ]
      }
    ],
    "titleNote": {
      "zh": "拿着照片逛港口",
      "points": [
        {
          "term": "port",
          "note": "阳性名词，港口。"
        },
        {
          "term": "photo en main",
          "note": "手里拿着照片。名词 + en main，描写拿着某物的样子。",
          "star": true
        }
      ]
    },
    "sentences": [
      {
        "fr": "À l’office de tourisme, demandez la pochette qui contient six photos anciennes du port.",
        "zh": "到游客中心，向工作人员要一个照片袋，里面装着六张港口的老照片。",
        "points": [
          {
            "term": "office de tourisme",
            "note": "阳性名词，游客中心。"
          },
          {
            "term": "demandez（demander）",
            "note": "索取、要。对 vous 的命令式，指南常这样写。",
            "star": true
          },
          {
            "term": "pochette",
            "note": "阴性名词，小袋子。"
          },
          {
            "term": "contient（contenir）",
            "note": "装有。"
          },
          {
            "term": "qui",
            "note": "指前面的 pochette，在后半句里当主语。",
            "star": true
          },
          {
            "term": "anciennes（ancien）",
            "note": "放在名词后，意思是年代久的。跟 photos 配合成阴性复数。"
          }
        ]
      },
      {
        "fr": "Le jeu consiste à retrouver l’endroit exact d’où chaque photo a été prise.",
        "zh": "玩法是找出当初拍每张照片时，摄影者站的确切位置。",
        "points": [
          {
            "term": "jeu",
            "note": "阳性名词，游戏。"
          },
          {
            "term": "consister à + 动词原形",
            "note": "内容是做……。",
            "star": true
          },
          {
            "term": "retrouver",
            "note": "找到。"
          },
          {
            "term": "endroit",
            "note": "阳性名词，地点。"
          },
          {
            "term": "exact",
            "note": "确切的。"
          },
          {
            "term": "d’où",
            "note": "从那里。照片是从那个位置拍的，所以用 d’où。",
            "star": true
          },
          {
            "term": "chaque",
            "note": "每一个，后面接单数。"
          },
          {
            "term": "a été prise（prendre）",
            "note": "被拍下。prise 跟 photo 配合，是阴性。",
            "star": true
          }
        ]
      },
      {
        "fr": "Sur la place, une horloge vous aidera par exemple à reconnaître l’ancienne poste, devenue un café.",
        "zh": "比如到了广场上，你可以凭一座钟认出从前的邮局，那儿如今是家咖啡馆。",
        "points": [
          {
            "term": "place",
            "note": "阴性名词，广场。"
          },
          {
            "term": "horloge",
            "note": "阴性名词，钟。"
          },
          {
            "term": "aider qn à + 动词原形",
            "note": "帮某人做某事。",
            "star": true
          },
          {
            "term": "aidera（aider）",
            "note": "将来时，到时候会帮你。"
          },
          {
            "term": "par exemple",
            "note": "比如。"
          },
          {
            "term": "reconnaître",
            "note": "认出。"
          },
          {
            "term": "l’ancienne poste",
            "note": "ancien 放在名词前，意思是从前的：从前的邮局。",
            "star": true
          },
          {
            "term": "devenue（devenir）",
            "note": "变成了。跟 poste 配合成阴性。"
          }
        ]
      },
      {
        "fr": "Au dos de la photo, une habitante raconte son premier jour de travail derrière le guichet.",
        "zh": "照片背面，一位当地居民讲起了自己头一天在邮局窗口上班的情形。",
        "points": [
          {
            "term": "au dos de",
            "note": "在……背面。dos 是阳性名词。"
          },
          {
            "term": "habitante",
            "note": "阴性名词，女居民。"
          },
          {
            "term": "raconte（raconter）",
            "note": "讲述。"
          },
          {
            "term": "premier jour de travail",
            "note": "上班第一天。"
          },
          {
            "term": "derrière",
            "note": "在……后面。"
          },
          {
            "term": "guichet",
            "note": "阳性名词，服务窗口。"
          }
        ]
      },
      {
        "fr": "Les étapes ne sont pas numérotées et vous pouvez les parcourir dans l’ordre qui vous plaît.",
        "zh": "各站没有编号，你可以按自己喜欢的顺序逛。",
        "points": [
          {
            "term": "étape",
            "note": "阴性名词，一站。"
          },
          {
            "term": "numérotées（numéroter）",
            "note": "编号。跟 étapes 配合成阴性复数。"
          },
          {
            "term": "les",
            "note": "代替 les étapes，放在 parcourir 前面。",
            "star": true
          },
          {
            "term": "parcourir",
            "note": "走一遍、逛遍。"
          },
          {
            "term": "ordre",
            "note": "阳性名词，顺序。"
          },
          {
            "term": "qui vous plaît",
            "note": "你喜欢的。plaire à qn，让某人喜欢。",
            "star": true
          }
        ]
      },
      {
        "fr": "Comptez une bonne heure pour la balade, un peu plus si vous aimez prendre des photos.",
        "zh": "逛一圈得留足一个小时，喜欢拍照的话，就再多留一点时间。",
        "points": [
          {
            "term": "comptez（compter）",
            "note": "估算要花的时间。命令式。",
            "star": true
          },
          {
            "term": "une bonne heure",
            "note": "足足一小时。"
          },
          {
            "term": "balade",
            "note": "阴性名词，散步、闲逛。"
          },
          {
            "term": "un peu plus",
            "note": "再多一点。"
          },
          {
            "term": "prendre des photos",
            "note": "拍照。"
          }
        ]
      },
      {
        "fr": "Le prêt est gratuit, mais pensez à rendre la pochette le jour même, avant la fermeture de l’office à dix-huit heures.",
        "zh": "照片袋可以免费借用，不过记得当天就还，要赶在游客中心傍晚六点关门以前。",
        "points": [
          {
            "term": "prêt",
            "note": "阳性名词，出借。"
          },
          {
            "term": "gratuit",
            "note": "免费的。"
          },
          {
            "term": "penser à + 动词原形",
            "note": "记得做……。",
            "star": true
          },
          {
            "term": "rendre",
            "note": "归还。"
          },
          {
            "term": "le jour même",
            "note": "当天。",
            "star": true
          },
          {
            "term": "fermeture",
            "note": "阴性名词，关门。"
          },
          {
            "term": "dix-huit heures",
            "note": "十八点，傍晚六点。"
          }
        ]
      },
      {
        "fr": "S’il pleut, vous pouvez vous installer dans la petite salle de lecture, juste à côté de l’accueil.",
        "zh": "如果下雨，你可以到小阅览室里坐坐，就在接待处旁边。",
        "points": [
          {
            "term": "s’il",
            "note": "= si + il，si 遇到 il 要缩写。",
            "star": true
          },
          {
            "term": "pleut（pleuvoir）",
            "note": "下雨。"
          },
          {
            "term": "s’installer",
            "note": "坐下来、安顿下来。"
          },
          {
            "term": "salle de lecture",
            "note": "阴性名词，阅览室。"
          },
          {
            "term": "à côté de",
            "note": "在……旁边。"
          },
          {
            "term": "accueil",
            "note": "阳性名词，接待处。"
          }
        ]
      },
      {
        "fr": "Vous y trouverez un grand plan du port pour situer les bâtiments sans sortir.",
        "zh": "那里有一张大幅港区图，不用出门就能找到各栋建筑的位置。",
        "points": [
          {
            "term": "y",
            "note": "指上一句的阅览室。"
          },
          {
            "term": "trouverez（trouver）",
            "note": "将来时，会找到。"
          },
          {
            "term": "plan",
            "note": "阳性名词，平面图。"
          },
          {
            "term": "situer",
            "note": "确定位置。"
          },
          {
            "term": "bâtiment",
            "note": "阳性名词，建筑物。"
          },
          {
            "term": "sans + 动词原形",
            "note": "不用做……。",
            "star": true
          }
        ]
      }
    ],
    "takeaways": [
      {
        "term": "consister à",
        "note": "说明内容是什么。"
      },
      {
        "term": "d’où",
        "note": "从那里，用来说位置的起点。"
      },
      {
        "term": "penser à + 动词原形",
        "note": "提醒别人记得做。"
      },
      {
        "term": "ancien 的位置",
        "note": "放名词前是从前的，放名词后是年代久的。"
      }
    ]
  },
  {
    "date": "2026-11-20",
    "level": "B2",
    "exam": "TCF",
    "title": "Au bureau, le ménage change d’heure",
    "paragraphs": [
      "Il est un peu plus de neuf heures quand Nadia pousse son chariot dans les locaux d’une société d’assurances. Il y a six mois encore, elle en repartait avant même que les premiers salariés n’arrivent. À la demande des agents d’entretien, la direction a accepté de tester le ménage en journée.",
      "« Je prenais le bus quatre fois par jour, puisque je revenais travailler le soir », se souvient-elle. Elle travaille toujours autant et touche le même salaire, mais ses heures sont désormais regroupées.",
      "Au début, il arrivait toutefois qu’une réunion s’éternise dans une salle que Nadia devait nettoyer. À sa demande, les salariés accrochent maintenant une étiquette verte à la poignée en quittant la salle. « Pendant deux ans, j’ai posé ma tasse chaque matin sur un bureau propre sans savoir qui l’avait nettoyé », confie l’un d’eux. Aujourd’hui, Nadia et lui discutent parfois en attendant que le café passe.",
      "L’entreprise de nettoyage qui emploie Nadia envisage d’étendre l’essai à d’autres sites. Les représentants du personnel demandent cependant que les agents concernés puissent donner leur avis avant toute décision. Si leur service se terminait plus tard, certains agents du matin devraient faire garder leurs enfants après l’école."
    ],
    "questions": [
      {
        "stem": "Quel avantage Nadia retire-t-elle du changement d’horaire ?",
        "options": [
          {
            "key": "A",
            "text": "Elle effectue moins d’heures sans baisse de salaire."
          },
          {
            "key": "B",
            "text": "Elle fait moins d’allers-retours pour son travail."
          },
          {
            "key": "C",
            "text": "Elle fixe elle-même ses heures d’arrivée et de départ."
          },
          {
            "key": "D",
            "text": "Elle bénéficie d’un contrat avec la société d’assurances."
          }
        ],
        "answer": "B",
        "evidence": [
          "Je prenais le bus quatre fois par jour, puisque je revenais travailler le soir",
          "ses heures sont désormais regroupées"
        ]
      },
      {
        "stem": "Que met en évidence l’anecdote du salarié qui parle de sa tasse ?",
        "options": [
          {
            "key": "A",
            "text": "Les bureaux sont mieux entretenus depuis le changement d’horaire."
          },
          {
            "key": "B",
            "text": "Les salariés participent désormais au nettoyage de leur bureau."
          },
          {
            "key": "C",
            "text": "Nadia a dû demander aux salariés de ranger leurs affaires."
          },
          {
            "key": "D",
            "text": "La présence de Nadia en journée a rendu son travail moins anonyme."
          }
        ],
        "answer": "D",
        "evidence": [
          "j’ai posé ma tasse chaque matin sur un bureau propre sans savoir qui l’avait nettoyé",
          "Aujourd’hui, Nadia et lui discutent parfois"
        ]
      },
      {
        "stem": "Pourquoi les représentants du personnel souhaitent-ils que les agents soient consultés ?",
        "options": [
          {
            "key": "A",
            "text": "L’attente devant les salles risque de rallonger tous les services."
          },
          {
            "key": "B",
            "text": "Il faudrait recruter du personnel avant d’étendre l’essai."
          },
          {
            "key": "C",
            "text": "Un changement d’horaire pourrait bousculer l’organisation de certaines familles."
          },
          {
            "key": "D",
            "text": "Les agents attendent une hausse de salaire en échange de leur accord."
          }
        ],
        "answer": "C",
        "evidence": [
          "certains agents du matin devraient faire garder leurs enfants après l’école"
        ]
      }
    ],
    "titleNote": {
      "zh": "办公室保洁换了时段",
      "points": [
        {
          "term": "ménage",
          "note": "阳性名词，打扫卫生。faire le ménage，做清洁。"
        },
        {
          "term": "changer d’heure",
          "note": "换时间。",
          "star": true
        }
      ]
    },
    "sentences": [
      {
        "fr": "Il est un peu plus de neuf heures quand Nadia pousse son chariot dans les locaux d’une société d’assurances.",
        "zh": "九点刚过，娜迪娅推着清洁车，走在一家保险公司的办公区里。",
        "points": [
          {
            "term": "un peu plus de neuf heures",
            "note": "九点刚过。"
          },
          {
            "term": "pousse（pousser）",
            "note": "推。"
          },
          {
            "term": "chariot",
            "note": "阳性名词，手推车。"
          },
          {
            "term": "locaux",
            "note": "local 的复数，阳性名词，办公场所。",
            "star": true
          },
          {
            "term": "société d’assurances",
            "note": "阴性名词，保险公司。"
          }
        ]
      },
      {
        "fr": "Il y a six mois encore, elle en repartait avant même que les premiers salariés n’arrivent.",
        "zh": "就在半年前，公司里最早上班的人还没到，她就已经从那儿离开了。",
        "points": [
          {
            "term": "il y a + 时长",
            "note": "……以前。",
            "star": true
          },
          {
            "term": "encore",
            "note": "这里是就在……还。"
          },
          {
            "term": "en",
            "note": "代替从那里，即那间办公区。"
          },
          {
            "term": "repartait（repartir）",
            "note": "离开。未完成过去时，那时天天如此。"
          },
          {
            "term": "avant même que + 虚拟式",
            "note": "甚至在……之前。",
            "star": true
          },
          {
            "term": "n’arrivent",
            "note": "这个 n’ 没有否定意思，去掉也对。",
            "star": true
          },
          {
            "term": "salarié",
            "note": "阳性名词，员工。"
          }
        ]
      },
      {
        "fr": "À la demande des agents d’entretien, la direction a accepté de tester le ménage en journée.",
        "zh": "应保洁员的要求，公司管理层同意试试白天打扫。",
        "points": [
          {
            "term": "à la demande de",
            "note": "应……的要求。",
            "star": true
          },
          {
            "term": "agent d’entretien",
            "note": "阳性名词，保洁员。"
          },
          {
            "term": "direction",
            "note": "阴性名词，管理层。"
          },
          {
            "term": "accepter de + 动词原形",
            "note": "同意做……。",
            "star": true
          },
          {
            "term": "tester",
            "note": "试行。"
          },
          {
            "term": "en journée",
            "note": "在白天。"
          }
        ]
      },
      {
        "fr": "« Je prenais le bus quatre fois par jour, puisque je revenais travailler le soir », se souvient-elle.",
        "zh": "“我那时每天得坐四趟公交车，因为晚上还得回来上班。”她回忆道。",
        "points": [
          {
            "term": "prenais（prendre）",
            "note": "未完成过去时，写那时的日常。"
          },
          {
            "term": "quatre fois par jour",
            "note": "一天四次。"
          },
          {
            "term": "puisque",
            "note": "因为，用于双方都知道的原因。",
            "star": true
          },
          {
            "term": "revenais（revenir）",
            "note": "回来。"
          },
          {
            "term": "se souvient-elle（se souvenir）",
            "note": "她回忆道。引语后面，主语和动词要倒过来。",
            "star": true
          }
        ]
      },
      {
        "fr": "Elle travaille toujours autant et touche le même salaire, mais ses heures sont désormais regroupées.",
        "zh": "她干的时间和以前一样长，拿的工资也一样，只是现在工时都排在了一起。",
        "points": [
          {
            "term": "toujours autant",
            "note": "还是一样多。",
            "star": true
          },
          {
            "term": "touche（toucher）",
            "note": "领工资的领。"
          },
          {
            "term": "salaire",
            "note": "阳性名词，工资。"
          },
          {
            "term": "désormais",
            "note": "从此、如今。",
            "star": true
          },
          {
            "term": "regroupées（regrouper）",
            "note": "集中在一起。跟 heures 配合成阴性复数。"
          }
        ]
      },
      {
        "fr": "Au début, il arrivait toutefois qu’une réunion s’éternise dans une salle que Nadia devait nettoyer.",
        "zh": "不过刚开始时，娜迪娅有时该打扫某间会议室了，里面的会却迟迟没开完。",
        "points": [
          {
            "term": "au début",
            "note": "刚开始时。"
          },
          {
            "term": "il arrivait que + 虚拟式",
            "note": "有时会发生……。",
            "star": true
          },
          {
            "term": "toutefois",
            "note": "不过。"
          },
          {
            "term": "réunion",
            "note": "阴性名词，会议。"
          },
          {
            "term": "s’éternise（s’éterniser）",
            "note": "拖得没完。"
          },
          {
            "term": "que",
            "note": "指前面的 salle，是 nettoyer 的对象。"
          },
          {
            "term": "devait（devoir）",
            "note": "应该、得。"
          }
        ]
      },
      {
        "fr": "À sa demande, les salariés accrochent maintenant une étiquette verte à la poignée en quittant la salle.",
        "zh": "应她的要求，员工们现在离开会议室时，会在门把手上挂一张绿色标签。",
        "points": [
          {
            "term": "accrocher qch à",
            "note": "把……挂在……上。",
            "star": true
          },
          {
            "term": "étiquette",
            "note": "阴性名词，标签。"
          },
          {
            "term": "verte",
            "note": "vert 的阴性。"
          },
          {
            "term": "poignée",
            "note": "阴性名词，门把手。"
          },
          {
            "term": "en quittant",
            "note": "离开的时候。en + 现在分词，表示同时。",
            "star": true
          }
        ]
      },
      {
        "fr": "« Pendant deux ans, j’ai posé ma tasse chaque matin sur un bureau propre sans savoir qui l’avait nettoyé », confie l’un d’eux.",
        "zh": "“有整整两年，我每天早上都把杯子放在干干净净的办公桌上，却不知道是谁擦的。”其中一位员工说。",
        "points": [
          {
            "term": "j’ai posé（poser）",
            "note": "放下。说的是那两年整体的经历，所以用复合过去时。",
            "star": true
          },
          {
            "term": "tasse",
            "note": "阴性名词，杯子。"
          },
          {
            "term": "propre",
            "note": "放在名词后，意思是干净的。",
            "star": true
          },
          {
            "term": "sans savoir",
            "note": "不知道。sans + 动词原形。"
          },
          {
            "term": "l’avait nettoyé",
            "note": "愈过去时，擦桌子发生在放杯子之前。",
            "star": true
          },
          {
            "term": "confie（confier）",
            "note": "吐露、坦言。"
          },
          {
            "term": "l’un d’eux",
            "note": "他们中的一个。"
          }
        ]
      },
      {
        "fr": "Aujourd’hui, Nadia et lui discutent parfois en attendant que le café passe.",
        "zh": "如今，等咖啡煮好的时候，娜迪娅和这位员工有时会聊上几句。",
        "points": [
          {
            "term": "lui",
            "note": "指刚才说话的员工。和 Nadia 并列当主语时用 lui，不用 il。",
            "star": true
          },
          {
            "term": "discutent（discuter）",
            "note": "聊天。"
          },
          {
            "term": "en attendant que + 虚拟式",
            "note": "在等……的时候。",
            "star": true
          },
          {
            "term": "passe（passer）",
            "note": "这里指咖啡滤好、煮好。"
          }
        ]
      },
      {
        "fr": "L’entreprise de nettoyage qui emploie Nadia envisage d’étendre l’essai à d’autres sites.",
        "zh": "雇用娜迪娅的保洁公司正考虑在其他工作地点也试行这种排班。",
        "points": [
          {
            "term": "entreprise de nettoyage",
            "note": "阴性名词，保洁公司。"
          },
          {
            "term": "emploie（employer）",
            "note": "雇用。"
          },
          {
            "term": "envisager de + 动词原形",
            "note": "打算、考虑做……。",
            "star": true
          },
          {
            "term": "étendre",
            "note": "扩大。"
          },
          {
            "term": "essai",
            "note": "阳性名词，试行。"
          },
          {
            "term": "site",
            "note": "阳性名词，工作地点。"
          }
        ]
      },
      {
        "fr": "Les représentants du personnel demandent cependant que les agents concernés puissent donner leur avis avant toute décision.",
        "zh": "不过，员工代表要求在作决定前，先让受调班影响的保洁员说说自己的想法。",
        "points": [
          {
            "term": "représentants du personnel",
            "note": "员工代表。"
          },
          {
            "term": "cependant",
            "note": "不过。"
          },
          {
            "term": "demander que + 虚拟式",
            "note": "要求……。",
            "star": true
          },
          {
            "term": "puissent（pouvoir）",
            "note": "虚拟式。"
          },
          {
            "term": "concernés",
            "note": "受影响的、相关的。"
          },
          {
            "term": "donner son avis",
            "note": "发表意见。avis 是阳性名词。"
          },
          {
            "term": "toute décision",
            "note": "任何决定。"
          }
        ]
      },
      {
        "fr": "Si leur service se terminait plus tard, certains agents du matin devraient faire garder leurs enfants après l’école.",
        "zh": "如果收工时间推迟，有些上早班的保洁员就得找人照看放学后的孩子。",
        "points": [
          {
            "term": "si + 未完成过去时 → 条件式",
            "note": "假设一件还没发生的事。",
            "star": true
          },
          {
            "term": "service",
            "note": "阳性名词，班次。"
          },
          {
            "term": "se terminait（se terminer）",
            "note": "结束。"
          },
          {
            "term": "certains",
            "note": "某些。"
          },
          {
            "term": "devraient（devoir）",
            "note": "条件式，那就得……。"
          },
          {
            "term": "faire garder",
            "note": "请人照看。faire + 动词原形，让别人做。",
            "star": true
          }
        ]
      }
    ],
    "takeaways": [
      {
        "term": "虚拟式",
        "note": "avant que、attendre que、il arrive que、demander que 后面都用虚拟式。"
      },
      {
        "term": "si + 未完成过去时 → 条件式",
        "note": "假设一件还没发生的事。"
      },
      {
        "term": "愈过去时",
        "note": "两件过去的事，更早的那件用它。"
      },
      {
        "term": "envisager de",
        "note": "打算做。"
      }
    ]
  }
]
