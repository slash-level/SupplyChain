console.log("--- NODE PROCESS STARTING ---");
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, p) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

const express = require('express');
const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse');
const handlebars = require('handlebars');
const puppeteer = require('puppeteer');
const admin = require('firebase-admin');

// Firebase Admin SDK 初期化
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
    console.log("Firebase Admin SDK initialized successfully.");
} else {
    console.warn("WARNING: GOOGLE_APPLICATION_CREDENTIALS is not set. Firebase Admin SDK will not be initialized.");
}

let markedInstance;
// markedの初期化 (必要に応じて)
try {
    const marked = require('marked');
    markedInstance = marked.marked;
} catch (e) {
    console.warn("marked not found, markdown to html helper might fail.");
}

// --- CSV Data Loading ---
async function loadCsvData() {
    const records = [];
    const parser = fs
        .createReadStream(path.join(__dirname, '../SC_Security.csv'))
        .pipe(parse({
            columns: false, // 2行ヘッダーに対応するため配列として読み込む
            skip_empty_lines: true,
            trim: true,
            bom: true,
        }));

    let lineCount = 0;
    for await (const record of parser) {
        lineCount++;
        // 経産省公式ファイルの1行目（カテゴリ）と2行目（文献名）をスキップ
        if (lineCount <= 2) continue;
        records.push(record);
    }
    return records;
}

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const DATABASE_URL = process.env.DATABASE_URL;

const sequelize = DATABASE_URL
  ? new Sequelize(DATABASE_URL, {
      dialect: 'postgres',
      protocol: 'postgres',
      logging: false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    })
  : new Sequelize({
      dialect: 'sqlite',
      storage: path.join(__dirname, 'database.sqlite'),
      logging: false,
    });

// --- Database Models ---

const Criterion = sequelize.define('Criterion', {
    requirement_id: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    },
    requirement_name: { type: DataTypes.STRING, allowNull: true },
    requirement_text: { type: DataTypes.TEXT, allowNull: false },
    star_level: { type: DataTypes.INTEGER, allowNull: false },
    criterion_id: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    },
    criterion_text: { type: DataTypes.TEXT, allowNull: false },
    category1_no: DataTypes.STRING,
    category1: DataTypes.STRING,
    category2_no: DataTypes.STRING,
    category2: DataTypes.STRING,
    level3_no: DataTypes.STRING,
    Level4_no: DataTypes.STRING,
    explanation: { type: DataTypes.TEXT, allowNull: true },
    // 参照文献フィールド
    ref_nist: { type: DataTypes.TEXT, allowNull: true },
    ref_cyber_essentials: { type: DataTypes.TEXT, allowNull: true },
    ref_cmmc: { type: DataTypes.TEXT, allowNull: true },
    ref_iso27001: { type: DataTypes.TEXT, allowNull: true },
    ref_gov: { type: DataTypes.TEXT, allowNull: true },
    ref_jais: { type: DataTypes.TEXT, allowNull: true },
});

const User = sequelize.define('User', {
    firebaseUid: { type: DataTypes.STRING, allowNull: false, unique: true, primaryKey: true },
    email: { type: DataTypes.STRING, allowNull: true, unique: true },
    companyName: { type: DataTypes.STRING, allowNull: true },
    role: { type: DataTypes.STRING, defaultValue: 'user' },
    companyId: { type: DataTypes.STRING, allowNull: true },
    organizationId: { type: DataTypes.UUID, allowNull: true },
    orgStatus: { type: DataTypes.STRING, defaultValue: 'approved' }
});

const Organization = sequelize.define('Organization', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    inviteCode: { type: DataTypes.STRING, allowNull: false, unique: true },
    ownerUid: { type: DataTypes.STRING, allowNull: false }
}, { timestamps: true });

const Answer = sequelize.define('Answer', {
    evaluationSetId: { 
        type: DataTypes.UUID, 
        allowNull: false, 
        primaryKey: true, 
        references: { model: 'EvaluationSets', key: 'evaluationSetId' } 
    },
    requirement_id: { type: DataTypes.STRING, primaryKey: true },
    criterion_id: { type: DataTypes.STRING, primaryKey: true },
    status: { type: DataTypes.STRING, allowNull: false },
    notes: { type: DataTypes.TEXT }
});

const AIAdvice = sequelize.define('AIAdvice', {
    evaluationSetId: { 
        type: DataTypes.UUID, 
        allowNull: false, 
        primaryKey: true, 
        references: { model: 'EvaluationSets', key: 'evaluationSetId' } 
    },
    requirement_id: { type: DataTypes.STRING, primaryKey: true },
    criterion_id: { type: DataTypes.STRING, primaryKey: true },
    mode: { type: DataTypes.STRING, primaryKey: true, defaultValue: 'advice' }, // modeを追加して主キーに含める
    advice_text: { type: DataTypes.TEXT, allowNull: false },
}, { timestamps: true });

const EvaluationSet = sequelize.define('EvaluationSet', {
    evaluationSetId: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    starLevel: { type: DataTypes.INTEGER, defaultValue: 3, allowNull: false },
    isTemplate: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'active', allowNull: false },
    firebaseUid: { type: DataTypes.STRING, allowNull: false },
}, { timestamps: true });

const ActionItem = sequelize.define('ActionItem', {
    actionItemId: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    evaluationSetId: { 
        type: DataTypes.UUID, 
        allowNull: false, 
        references: { model: 'EvaluationSets', key: 'evaluationSetId' } 
    },
    requirement_id: { type: DataTypes.STRING, allowNull: false },
    criterion_id: { type: DataTypes.STRING, allowNull: false },
    taskDescription: { type: DataTypes.TEXT, allowNull: false },
    assignee: { type: DataTypes.STRING, allowNull: true },
    dueDate: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: '未着手' },
}, { timestamps: true });

// Associations
Organization.hasMany(User, { foreignKey: 'organizationId' });
User.belongsTo(Organization, { foreignKey: 'organizationId' });
EvaluationSet.hasMany(Answer, { foreignKey: 'evaluationSetId', onDelete: 'CASCADE' });
Answer.belongsTo(EvaluationSet, { foreignKey: 'evaluationSetId' });
EvaluationSet.hasMany(AIAdvice, { foreignKey: 'evaluationSetId', onDelete: 'CASCADE' });
AIAdvice.belongsTo(EvaluationSet, { foreignKey: 'evaluationSetId' });
EvaluationSet.hasMany(ActionItem, { foreignKey: 'evaluationSetId', onDelete: 'CASCADE' });
ActionItem.belongsTo(EvaluationSet, { foreignKey: 'evaluationSetId' });
User.hasMany(EvaluationSet, { foreignKey: 'firebaseUid', onDelete: 'CASCADE' });
EvaluationSet.belongsTo(User, { foreignKey: 'firebaseUid' });

Criterion.hasMany(ActionItem, { foreignKey: ['requirement_id', 'criterion_id'], onDelete: 'CASCADE', onUpdate: 'CASCADE' });
ActionItem.belongsTo(Criterion, { foreignKey: ['requirement_id', 'criterion_id'], onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Answer.belongsTo(Criterion, { foreignKey: ['requirement_id', 'criterion_id'], onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Criterion.hasMany(Answer, { foreignKey: ['requirement_id', 'criterion_id'], onDelete: 'CASCADE', onUpdate: 'CASCADE' });
AIAdvice.belongsTo(Criterion, { foreignKey: ['requirement_id', 'criterion_id'], onDelete: 'CASCADE', onUpdate: 'CASCADE' });
Criterion.hasMany(AIAdvice, { foreignKey: ['requirement_id', 'criterion_id'], onDelete: 'CASCADE', onUpdate: 'CASCADE' });

// --- Handlebars Helpers ---
handlebars.registerHelper('formatDate', function(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
});

handlebars.registerHelper('getDynamicId', function(requirement, starFilter) {
    if (!requirement || !requirement.criteria) return requirement.id;
    const filter = parseInt(starFilter, 10);
    if (filter === 3) {
        const crit3 = requirement.criteria.find(c => c.level3_no);
        if (crit3 && crit3.level3_no) return crit3.level3_no;
    }
    const crit4 = requirement.criteria.find(c => c.Level4_no);
    if (crit4 && crit4.Level4_no) return crit4.Level4_no;
    return requirement.id;
});

handlebars.registerHelper('markdownToHtml', function(markdownText) {
    if (!markdownText) return '';
    return new handlebars.SafeString(markedInstance ? markedInstance(markdownText) : markdownText);
});

// AI Advice function using Google Gemini API
async function getAIAdvice(prompt) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set in .env");
    const MODEL_NAME = process.env.GEMINI_MODEL_NAME || "models/gemini-2.5-flash";
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
                ],
            }),
        });
        if (!response.ok) {
            if (response.status === 503) throw new Error('SERVICE_UNAVAILABLE');
            const errorText = await response.text();
            throw new Error(`Gemini API responded with status ${response.status}: ${errorText}`);
        }
        const data = await response.json();
        if (data.candidates && data.candidates.length > 0) {
            const candidate = data.candidates[0];
            if (candidate.finishReason === 'MAX_TOKENS') throw new Error('MAX_TOKENS');
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) return candidate.content.parts[0].text;
        }
        return '';
    } catch (error) { throw error; }
}

function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 9; i++) {
        if (i > 0 && i % 3 === 0) code += '-';
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// --- API Endpoints ---
app.get('/api/health', (req, res) => res.json({ status: 'ok', message: 'Server is healthy' }));

app.post('/api/organizations', async (req, res) => {
    try {
        const { name, ownerUid } = req.body;
        if (!name || !ownerUid) return res.status(400).json({ error: 'Missing required fields' });
        const organization = await Organization.create({ name, inviteCode: generateInviteCode(), ownerUid });
        await User.update({ organizationId: organization.id, role: 'admin' }, { where: { firebaseUid: ownerUid } });
        res.status(201).json(organization);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/organizations/join', async (req, res) => {
    try {
        const { inviteCode, firebaseUid } = req.body;
        const organization = await Organization.findOne({ where: { inviteCode: inviteCode.toUpperCase() } });
        if (!organization) return res.status(404).json({ error: '無効' });
        await User.update({ organizationId: organization.id, role: 'user' }, { where: { firebaseUid } });
        res.json({ message: '参加', organization });
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/organizations/:id', async (req, res) => {
    try {
        const organization = await Organization.findByPk(req.params.id, { include: [{ model: User, attributes: ['firebaseUid', 'email', 'companyName', 'role'] }] });
        if (!organization) return res.status(404).json({ error: 'Not found' });
        res.json(organization);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/criteria', async (req, res) => {
  try {
    const criteria = await Criterion.findAll({ order: [['criterion_id', 'ASC']] });
    res.json(criteria);
  } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/users', async (req, res) => {
    try {
        const { firebaseUid, email, companyName, role, companyId, organizationId } = req.body;
        const [user, created] = await User.findOrCreate({ where: { firebaseUid }, defaults: { email: email || null, companyName, role: role || 'user', companyId, organizationId: organizationId || null, orgStatus: 'approved' } });
        if (!created) {
            if (email && user.email !== email) user.email = email;
            if (companyName !== undefined) user.companyName = companyName;
            if (role) user.role = role;
            if (organizationId !== undefined) user.organizationId = organizationId;
            await user.save();
        }
        res.status(created ? 201 : 200).json(user);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/users/:firebaseUid', async (req, res) => {
    const { firebaseUid } = req.params;
    const transaction = await sequelize.transaction();
    try {
        const user = await User.findOne({ where: { firebaseUid }, transaction });
        if (user) {
            await EvaluationSet.destroy({ where: { firebaseUid: user.firebaseUid }, transaction });
            await user.destroy({ transaction });
        }
        await admin.auth().deleteUser(firebaseUid);
        await transaction.commit();
        res.status(200).json({ message: 'Success' });
    } catch (error) { await transaction.rollback(); res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/evaluationsets/:firebaseUid', async (req, res) => {
    try {
        const requestingUser = await User.findByPk(req.params.firebaseUid);
        let whereClause = { firebaseUid: req.params.firebaseUid };
        if (requestingUser && requestingUser.role === 'admin' && requestingUser.organizationId) {
            const colleagueUids = await User.findAll({ attributes: ['firebaseUid'], where: { organizationId: requestingUser.organizationId }, raw: true }).then(users => users.map(u => u.firebaseUid));
            whereClause = { firebaseUid: { [Op.in]: colleagueUids } };
        }

        // 評価セット一覧を取得
        const evaluationSets = await EvaluationSet.findAll({ 
            where: whereClause, 
            order: [['createdAt', 'DESC']], 
            include: [{ model: User, attributes: ['email', 'companyName'] }] 
        });

        // 全項目数を取得（★3と★4それぞれ）
        const totalCriteria3 = await Criterion.count({ where: { star_level: { [Op.lte]: 3 } } });
        const totalCriteria4 = await Criterion.count({ where: { star_level: { [Op.lte]: 4 } } });

        // 各セットの進捗率を計算
        const setsWithProgress = await Promise.all(evaluationSets.map(async (set) => {
            const totalCount = set.starLevel === 4 ? totalCriteria4 : totalCriteria3;
            const answeredCount = await Answer.count({
                where: {
                    evaluationSetId: set.evaluationSetId,
                    status: { [Op.ne]: '未評価' }
                }
            });
            const progressRate = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;
            
            const rawSet = set.toJSON();
            return { ...rawSet, progressRate };
        }));

        res.json(setsWithProgress);
    } catch (error) { 
        console.error('Error fetching evaluation sets with progress:', error);
        res.status(500).json({ error: 'Failed' }); 
    }
});

app.get('/api/evaluationset/:id', async (req, res) => {
    try {
        const evaluationSet = await EvaluationSet.findByPk(req.params.id, { include: [{ model: User, attributes: ['email', 'companyName', 'companyId'] }] });
        if (!evaluationSet) return res.status(404).json({ error: 'Not found' });
        res.json(evaluationSet);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/evaluationsets', async (req, res) => {
    try {
        const { firebaseUid, name, description, starLevel } = req.body;
        const existingSet = await EvaluationSet.findOne({ where: { firebaseUid, name } });
        if (existingSet) return res.status(409).json({ error: '同名存在' });
        const evaluationSet = await EvaluationSet.create({ firebaseUid, name, description, starLevel: starLevel || 3 });
        res.status(201).json(evaluationSet);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.put('/api/evaluationsets/:id', async (req, res) => {
    try {
        const { name, description, status, starLevel } = req.body;
        const evaluationSet = await EvaluationSet.findByPk(req.params.id);
        if (!evaluationSet) return res.status(404).json({ error: 'Not found' });
        evaluationSet.name = name ?? evaluationSet.name;
        evaluationSet.description = description ?? evaluationSet.description;
        evaluationSet.status = status ?? evaluationSet.status;
        evaluationSet.starLevel = starLevel ?? evaluationSet.starLevel;
        await evaluationSet.save();
        res.json(evaluationSet);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/answers', async (req, res) => {
    try {
        const { evaluationSetId, requirement_id, criterion_id, status, notes } = req.body;
        const [answer, created] = await Answer.findOrCreate({ where: { evaluationSetId, requirement_id, criterion_id }, defaults: { status, notes } });
        if (!created) {
            answer.status = status;
            answer.notes = notes;
            await answer.save();
        }
        res.status(created ? 201 : 200).json(answer);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/answers/:evaluationSetId', async (req, res) => {
    try {
        const answers = await Answer.findAll({ where: { evaluationSetId: req.params.evaluationSetId }, order: [['requirement_id', 'ASC'], ['criterion_id', 'ASC']], raw: true });
        const advices = await AIAdvice.findAll({ where: { evaluationSetId: req.params.evaluationSetId }, raw: true });
        // modeを含めたマップを作成
        const adviceMap = new Map();
        advices.forEach(a => {
            adviceMap.set(`${a.evaluationSetId}-${a.requirement_id}-${a.criterion_id}-${a.mode}`, a);
        });
        
        const combinedData = answers.map(answer => {
            const keyBase = `${answer.evaluationSetId}-${answer.requirement_id}-${answer.criterion_id}`;
            return { 
                ...answer, 
                ai_judgment: adviceMap.get(`${keyBase}-judge`) || null,
                ai_advice: adviceMap.get(`${keyBase}-advice`) || null
            };
        });
        res.json(combinedData);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/ai/advice', async (req, res) => {
    const { evaluationSetId, requirement_id, criterion_id, requirementText, criterionText, notes, mode } = req.body;
    if (!evaluationSetId || !requirement_id || !criterion_id || !requirementText || !criterionText) return res.status(400).json({ error: 'Missing required fields' });
    
    // データベースから参照文献情報を取得
    const criterionData = await Criterion.findOne({ where: { requirement_id, criterion_id } });

    await Answer.findOrCreate({ where: { evaluationSetId, requirement_id, criterion_id }, defaults: { status: '未評価', notes: notes || '' } });

    const buildPrompt = (includeNotes) => {
        let promptCore = [];
        if (mode === 'judge') {
            promptCore = [
                'あなたはITセキュリティの導入を支援するサポーター兼コンサルタントです。',
                '組織の現状（備考）を基に、以下のセキュリティ評価基準の「達成度」を前向きに判定し、寄り添ったアドバイスをしてください。',
                '', '# セキュリティ要求事項', requirementText, '', '# 評価基準', criterionText,
            ];
            if (includeNotes && notes) promptCore.push('', '# 組織の現状（備考）', notes);
            else promptCore.push('', '# 組織の現状（備考）', '（現状は未入力です）');
        } else {
            promptCore = [
                'あなたはITセキュリティを専門とするコンサルタントです。',
                '組織の担当者にも分かりやすいように、以下のセキュリティ要件を達成するための具体的な改善計画を提案してください。',
                '', '# セキュリティ要求事項', requirementText, '', '# 未達成の評価基準', criterionText,
            ];
            if (includeNotes && notes) promptCore.push('', '# ユーザーによる補足情報（備考）', notes);
        }

        // 参照文献情報をプロンプトに追加
        if (criterionData) {
            const refs = [];
            if (criterionData.ref_nist) refs.push(`- NIST CSF: ${criterionData.ref_nist}`);
            if (criterionData.ref_iso27001) refs.push(`- ISO/IEC 27001:2022: ${criterionData.ref_iso27001}`);
            if (criterionData.ref_cmmc) refs.push(`- CMMC: ${criterionData.ref_cmmc}`);
            if (criterionData.ref_gov) refs.push(`- 政府統一基準: ${criterionData.ref_gov}`);
            if (criterionData.ref_cyber_essentials) refs.push(`- Cyber Essentials: ${criterionData.ref_cyber_essentials}`);
            if (criterionData.ref_jais) refs.push(`- 自工会/部工会ガイドライン: ${criterionData.ref_jais}`);

            if (refs.length > 0) {
                promptCore.push('', '# 関連する主要な基準・規格の参照条項', ...refs);
            }
        }

        const promptInstructions = [
            '', '# 禁止事項 (最重要)', '- **「中小企業」という単語は絶対に使用しないでください。** 代わりに「組織」や「企業」といった一般的な単語を使用してください。', '- **「〇〇社」のような、架空の企業名や個人名を例として使用しないでください。**', '- **参考情報のURLは記載しないでください。** 代わりに、参考となる文書の正式名称（発行元を含む）を正確に記載してください。', '', '# 指示'
        ];

        if (mode === 'judge') {
            promptInstructions.push(
                '1. 組織の現状（備考）が、評価基準の「本質的な意図」を満たしているか、支援的な視点で判定してください。',
                '2. 判定結果は、冒頭に以下のいずれかを明記してください。',
                '   - 【達成】：中心的な取り組みが行われており、基準の意図を概ね満たしている場合',
                '   - 【未達成】：取り組みが全く行われていないか、意図から大きく外れている場合',
                '   - 【判断には情報不足】：備考が短すぎるなど、判定が困難な場合',
                '3. 実態として取り組みが行われている場合は前向きに【達成】と判定した上で、「さらに信頼性を高めるためのステップアップ案」をアドバイスとして添えてください。',
                '4. **【重要：スコープの厳守】**：アドバイスは、提示された「評価基準」の達成に直結する具体的な内容のみに絞ってください。ガバナンス項目（1-3-1-1等）以外では、安易に「基本方針の策定」といった上位レイヤーの一般論を推奨せず、目の前の具体的な対策（例：リストの項目、バックアップの方法等）に集中してください。'
            );
        } else {
            promptInstructions.push(
                '1. 上記の要求事項、評価基準、補足情報を踏まえ、評価基準を「達成」にするための具体的で実行可能なアクションプランを提案してください。',
                '2. **【重要：ピンポイントな助言】**：アドバイスのスコープを、提示された「評価基準」だけに厳格に絞ってください。関係のない「基本方針の策定」や「体制の構築」などの一般論を前置きとして含めず、その項目をクリアするために「具体的に何をすべきか（例：どのようなリストを作るか、どのような設定をするか）」を直接回答してください。',
                '3. **【用語の正確性】**：ISO 27002 やガイドラインを参考にしつつ、1-3-1-1 等の「方針」そのものがテーマである場合を除き、常に実務的な「ルール（規程・手順書）」の具体化に焦点を当ててください。'
            );
        }

        const promptFooter = [
            '', '## 回答形式', '- 全体はマークダウン形式で記述してください。', '- リスト形式で記述してください。', '- **太字にする場合は、必ずアスタリスク2つ（`**`）で囲んでください。', ''
        ];

        return [...promptCore, ...promptInstructions, ...promptFooter].join('\n');
    };

    try {
        // --- Attempt 1: Full prompt (with notes) ---
        const fullPrompt = buildPrompt(true);
        let adviceText = await getAIAdvice(fullPrompt);

        await AIAdvice.upsert({ evaluationSetId, requirement_id, criterion_id, mode, advice_text: adviceText });
        const newAdvice = await AIAdvice.findOne({ where: { evaluationSetId, requirement_id, criterion_id, mode } });
        res.json(newAdvice);

    } catch (error) {
        if (error.message === 'MAX_TOKENS') {
            console.log('MAX_TOKENS error on first attempt. Retrying without notes...');
            try {
                // --- Attempt 2: Fallback prompt (without notes) ---
                const simplePrompt = buildPrompt(false);
                let adviceText = await getAIAdvice(simplePrompt);

                const disclaimer = `**[ご注意]** 生成するアドバイスが長くなりすぎたため、備考欄の情報は考慮されていません。\n\n---\n\n`;
                adviceText = disclaimer + adviceText;

                await AIAdvice.upsert({ evaluationSetId, requirement_id, criterion_id, mode, advice_text: adviceText });
                const newAdvice = await AIAdvice.findOne({ where: { evaluationSetId, requirement_id, criterion_id, mode } });
                return res.json(newAdvice);
            } catch (fallbackError) {
                console.error('Error on fallback attempt:', fallbackError);
                return res.status(500).json({ error: 'MAX_TOKENS_FALLBACK_FAILED', message: 'AIが応答を生成できませんでした。要求が複雑すぎる可能性があります。' });
            }
        } else if (error.message === 'SERVICE_UNAVAILABLE') {
            return res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'AIモデルが混み合っています。しばらく時間をおいてから、再度お試しください。' });
        } else {
            console.error('Error getting AI advice:', error);
            return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'AIアドバイスの生成中に不明なエラーが発生しました。' });
        }
    }
});

app.post('/api/ai/generate-action-item', async (req, res) => {
    const { adviceText, criterionId } = req.body;
    if (!adviceText) return res.status(400).json({ error: 'Advice text is required' });

    const prompt = `
以下のセキュリティ改善アドバイスから、実施すべき具体的なアクションを簡潔にまとめた「アクションアイテム名」を1つ作成してください。

# 改善アドバイス
${adviceText}

# 指示
- 提示された改善アドバイスの核心（最も重要な実務アクション）を抽出し、「〜を作成する」「〜を整備する」といった具体的な動作で締めくくってください。
- 1-3-1-1のようなガバナンス項目を除き、「教育」「点検体制の構築」「経営層のコミットメント」といったISMSの一般論や周辺要素は盛り込まず、目の前の評価基準を達成するための直接的な作業内容に絞ってください。
- 80文字以内の簡潔かつ具体的な内容にしてください。
- 記号や装飾は含めず、テキストのみを返してください。
`;

    try {
        const taskDescription = await getAIAdvice(prompt);
        res.json({ taskDescription: taskDescription.trim().replace(/^[\n\r*-]+|[\n\r*-]+$/g, '') });
    } catch (error) {
        console.error('Error drafting action item:', error);
        res.status(500).json({ error: 'Failed to generate task draft' });
    }
});

app.get('/api/actionitems/:evaluationSetId', async (req, res) => {
    try {
        const actionItems = await ActionItem.findAll({ where: { evaluationSetId: req.params.evaluationSetId }, order: [['createdAt', 'ASC']] });
        res.json(actionItems);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/actionitems', async (req, res) => {
    try {
        const { evaluationSetId, requirement_id, criterion_id, taskDescription, assignee, dueDate, status } = req.body;
        const actionItem = await ActionItem.create({ evaluationSetId, requirement_id, criterion_id, taskDescription, assignee, dueDate, status });
        res.status(201).json(actionItem);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.put('/api/actionitems/:actionItemId', async (req, res) => {
    try {
        const actionItem = await ActionItem.findByPk(req.params.actionItemId);
        if (!actionItem) return res.status(404).json({ error: 'Not found' });
        Object.assign(actionItem, req.body);
        await actionItem.save();
        res.json(actionItem);
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/actionitems/:actionItemId', async (req, res) => {
    try {
        const actionItem = await ActionItem.findByPk(req.params.actionItemId);
        if (actionItem) await actionItem.destroy();
        res.status(204).send();
    } catch (error) { res.status(500).json({ error: 'Failed' }); }
});

// Helper function for escapeHtml
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return text.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function getStatusColor(status) {
    switch (status) {
        case '達成': return '#28a745';
        case '未達成': return '#dc3545';
        case '一部達成': return '#ffc107';
        case '該当なし': return '#6c757d';
        case '未評価': return '#f8f9fa';
        default: return '#ffffff';
    }
}

function generatePdfHtml(requirements, evaluationSetName, actionItems) {
    let body = '';

    const getCat1No = (cat1Key) => {
        const cat1Data = requirements[cat1Key];
        if (!cat1Data) return 999;
        const cat2Keys = Object.keys(cat1Data);
        if (cat2Keys.length === 0) return 999;
        const reqs = cat1Data[cat2Keys[0]];
        if (!reqs || reqs.length === 0) return 999;
        return parseInt(reqs[0].category1_no || '999', 10);
    };

    const sortedCat1Keys = Object.keys(requirements).sort((a, b) => getCat1No(a) - getCat1No(b));

    for (const category1 of sortedCat1Keys) {
        const subCategories = requirements[category1];
        const cat1No = getCat1No(category1);
        const displayCat1No = cat1No === 999 ? '' : `${cat1No}. `;
        
        body += `<div class="category-group"><h1>${displayCat1No}${escapeHtml(category1)}</h1>`;
        
        const sortedCat2Keys = Object.keys(subCategories).sort((a, b) => {
            const valA = subCategories[a][0]?.category2_no || '999';
            const valB = subCategories[b][0]?.category2_no || '999';
            return valA.localeCompare(valB, undefined, { numeric: true });
        });

        for (const category2 of sortedCat2Keys) {
            const reqs = subCategories[category2];
            if (!reqs || reqs.length === 0) continue;
            const cat2No = reqs[0].category2_no || '';
            const displayCat2No = cat2No === '999' ? '' : `${cat2No}. `;

            body += `<div class="subcategory-group"><h2>${displayCat2No}${escapeHtml(category2)}</h2>`;
            for (const req of reqs) {
                body += `
                    <div class="requirement">
                        <h3>${escapeHtml(req.id)}. ${req.name ? `【${escapeHtml(req.name)}】` : ''}${escapeHtml(req.text)}</h3>
                        <table class="criteria-table">
                            <thead>
                                <tr>
                                    <th style="width: 60px;">ID</th>
                                    <th>評価基準</th>
                                    <th style="width: 80px;">評価</th>
                                    <th style="width: 150px;">備考</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${req.criteria.map(c => `
                                    <tr>
                                        <td>${escapeHtml(c.criterion_id)}</td>
                                        <td>${escapeHtml(c.criterion_text)}</td>
                                        <td><span class="status-badge" style="background-color: ${getStatusColor(c.status)}; color: ${c.status === '未評価' ? '#000' : '#fff'};">${escapeHtml(c.status)}</span></td>
                                        <td class="notes">${escapeHtml(c.notes || '').replace(/\n/g, '<br>')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
            body += `</div>`;
        }
        body += `</div>`;
    }

    if (actionItems && actionItems.length > 0) {
        body += `<div style="page-break-before: always;"><h1>アクションアイテム一覧</h1>
            <table class="criteria-table">
                <thead><tr><th>基準ID</th><th>タスク</th><th>担当</th><th>期日</th><th>状況</th></tr></thead>
                <tbody>
                    ${actionItems.map(item => `
                        <tr><td>${escapeHtml(item.criterion_id)}</td><td>${escapeHtml(item.taskDescription)}</td><td>${escapeHtml(item.assignee || '')}</td><td>${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : ''}</td><td>${escapeHtml(item.status)}</td></tr>
                    `).join('')}
                </tbody>
            </table></div>`;
    }

    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><style>
        body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 11px; line-height: 1.4; color: #333; }
        h1 { border-bottom: 2px solid #333; margin-top: 20px; font-size: 16px; page-break-after: avoid; }
        h2 { background: #f0f0f0; padding: 6px 10px; font-size: 14px; border-radius: 4px; margin-top: 15px; page-break-after: avoid; }
        h3 { border-left: 5px solid #007bff; padding-left: 10px; margin-top: 15px; font-size: 12px; page-break-after: avoid; }
        .criteria-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; table-layout: fixed; }
        .criteria-table th, .criteria-table td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; word-wrap: break-word; }
        .criteria-table th { background-color: #f8f9fa; font-weight: bold; }
        .status-badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 9px; white-space: nowrap; }
        .requirement { page-break-inside: avoid; }
        @page { size: A4; margin: 20mm 15mm; }
    </style></head><body><h1 style="text-align: center; border: none; font-size: 22px;">セキュリティ評価レポート</h1><div style="text-align: center; margin-bottom: 20px; font-size: 16px;">評価セット: ${escapeHtml(evaluationSetName)}</div>${body}</body></html>`;
}

app.post('/api/report/pdf', async (req, res) => {
    const { requirements, evaluationSetName, actionItems } = req.body;
    if (!requirements) return res.status(400).send({ error: 'Invalid data' });
    
    let browser;
    const tempFileName = `report-${Date.now()}.pdf`;
    const tempFilePath = path.join(__dirname, tempFileName);

    try {
        const htmlContent = generatePdfHtml(requirements, evaluationSetName || '', actionItems);
        browser = await puppeteer.launch({ 
            headless: true, 
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] 
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 300000 });
        
        await page.pdf({ 
            path: tempFilePath,
            format: 'A4', 
            margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
            printBackground: true 
        });

        res.sendFile(tempFilePath, { headers: { 'Content-Disposition': 'attachment; filename=report.pdf' } }, (err) => {
            if (err) console.error('Send error:', err);
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        });

    } catch (error) {
        console.error('PDF Error:', error);
        if (!res.headersSent) res.status(500).send({ error: 'Failed to generate PDF' });
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    } finally {
        if (browser) await browser.close();
    }
});

async function setupAndStartServer() {
  try {
    console.log("Step 1: Starting setup...");
    const shouldForceSync = process.env.DB_RESET === 'true';
    if (shouldForceSync) {
      console.log("Step 1.5: DB_RESET is true. Forcing database sync (dropping all tables)...");
      await sequelize.sync({ force: true });
    } else {
      console.log("Step 1.5: Syncing database (creating tables if not exist)...");
      await sequelize.sync({ alter: true });
    }
    console.log("Step 2: Database & tables synced!");

    const count = await Criterion.count();
    console.log(`Step 3: Found ${count} existing criteria.`);

    // --- Master Explanation Loading ---
    let masterExplanations = {};
    const explanationPath = path.join(__dirname, 'master_explanations.json');
    if (fs.existsSync(explanationPath)) {
        try {
            masterExplanations = JSON.parse(fs.readFileSync(explanationPath, 'utf8'));
            console.log(`Loaded ${Object.keys(masterExplanations).length} master explanations.`);
        } catch (e) {
            console.error("Failed to parse master_explanations.json:", e);
        }
    }

    if (count === 0 || shouldForceSync) {
      console.log("Step 4: Seeding data from METI official CSV format (with references)...");
      const rawCsvRecords = await loadCsvData();
      const seedData = rawCsvRecords.map(row => {
        const reqId = row[4];
        const critId = row[10];
        const starStr = row[9] || '';
        if (!reqId || !critId) return null;
        let starLevel = starStr.includes('★3') ? 3 : 4;
        return {
            category1_no: row[0], category1: row[1], category2_no: row[2], category2: row[3],
            requirement_id: reqId, requirement_name: row[7], requirement_text: row[8],
            star_level: starLevel, criterion_id: critId, criterion_text: row[11],
            level3_no: row[5] === '○' ? critId : null, Level4_no: row[6] === '○' ? critId : null,
            explanation: masterExplanations[critId] || null,
            ref_nist: row[12], ref_cyber_essentials: row[13], ref_cmmc: row[14], ref_iso27001: row[15], ref_gov: row[16], ref_jais: row[17]
        };
      }).filter(Boolean);

      if (count > 0) {
          console.log("Clearing existing criteria...");
          await Criterion.destroy({ where: {}, truncate: true });
      }
      await Criterion.bulkCreate(seedData);
      console.log(`Step 5: Seeding completed! ${seedData.length} criteria loaded with references.`);
    } else {
        // すでにデータがある場合でも、解説JSONの内容で既存レコードを更新する
        if (Object.keys(masterExplanations).length > 0) {
            console.log("Step 4 (Sync): Updating existing criteria with latest explanations from JSON...");
            for (const [critId, text] of Object.entries(masterExplanations)) {
                await Criterion.update(
                    { explanation: text },
                    { where: { criterion_id: critId } }
                );
            }
            console.log("Step 5 (Sync): Explanations updated!");
        }
    }

    console.log("Step 6: Preparing to start server...");
    const activeGeminiModel = process.env.GEMINI_MODEL_NAME || "models/gemini-2.5-flash";
    console.log(`Gemini Model in use: ${activeGeminiModel}`);
    app.listen(port, () => {
        console.log(`--- SERVER IS RUNNING ---
`);
        console.log(`Server listening on http://localhost:${port}`);
    });
  } catch (error) { 
      console.error("--- AN ERROR OCCURRED ---");
      console.error("Failed to setup or start server:", error); 
  }
}

setupAndStartServer();
app.use(express.static(path.join(__dirname, '../client/build')));
app.get('/*', (req, res) => res.sendFile(path.join(__dirname, '../client/build/index.html')));
