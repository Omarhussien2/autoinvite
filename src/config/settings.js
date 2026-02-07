const path = require('path');

module.exports = {
    // Image Generation Config
    image: {
        templatePath: path.resolve(__dirname, '../../assets/TEMPLATE2.png'),
        fontPath: path.resolve(__dirname, '../../assets/TSNAS-BOLD.OTF'),
        fontFamily: 'CustomFont',
        fontSize: '75px',
        textColor: '#2f4858',
        textPosition: {
            x: 540,
            y: 730
        }
    },

    // WhatsApp Automation Config
    whatsapp: {
        typingDelay: 2000,
        minDelay: 20000, // 20 ثانية حد أدنى
        maxDelay: 45000  // 45 ثانية حد أقصى
    },

    // Paths
    paths: {
        outputDir: path.resolve(__dirname, '../../temp'),
        logFile: path.resolve(__dirname, '../../logs/report.txt')
    },

    // Message Templates with Weights (نسب الظهور)
    // الوزن = نسبة الظهور التقريبية
    // مثلاً: weight: 3 = احتمال 3 أضعاف الرسائل ذات weight: 1
    messages: [
        {
            weight: 3, // نسبة عالية (حوالي 50%)
            text: `أهلاً [الاسم] 👋🏼\n\nلأنك جزء من عائلة جلاس، ما يكمل ختام الموسم الثالث إلا بوجودك! حبينا تكون الليلة الأخيرة هدية خاصة لك ولمن تحب.. 🎁\n\nلك 3 تذاكر مجانية بالكامل (لك ولشخصين يعزون عليك) لحضور لقاء أ. نواف البيضاني القادم. استخدم كود الخصم: FREE وصفر السلة فوراً! 😍\n\nالمقاعد محدودة جداً لهذا اللقاء، احجز أماكنكم الآن:\nhttps://samawah.store/نواف-البيضاني/p1367448884`
        },
        {
            weight: 2, // نسبة متوسطة (حوالي 33%)
            text: `يا هلا [الاسم]،\n\nمين ودّك يعيش معك أجواء جلاس؟ 🤔\n\nبمناسبة ختام الموسم الثالث، قررنا نبيّض وجهك مع أصحابك!\n\nهذه دعوة مفتوحة لك + 2 من أصدقائك مجاناً لحضور أمسية "اللغة.. الخصيصة التي تميزنا". فرصة تعزمهم على أمسية ثقافية فاخرة ولن تُنسى.. والحساب علينا 😉\n\nفقط استخدم كود: FREE\n\nالرابط شغال لفترة قصيرة، الحق عليه:\nhttps://samawah.store/نواف-البيضاني/p1367448884`
        },
        {
            weight: 1, // نسبة أقل (حوالي 17%)
            text: `مرحباً [الاسم]،\n\nهل اللغة مجرد كلام؟ أم هي هويتنا؟ 🤔\n\nفي جلاس القادم، نغوص في هذا العمق مع أ. نواف البيضاني. نعدك بأمسية لا تُنسى من المتعة والمعرفة في مركز نسما.\n\nالمقاعد تمتلئ سريعاً، وثّق حضورك فوراً من هنا: 👇🏼\nhttps://samawah.store/نواف-البيضاني/p1367448884`
        }
    ]
};
