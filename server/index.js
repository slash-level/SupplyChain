const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse');
const handlebars = require('handlebars');
const puppeteer = require('puppeteer');
const admin = require('firebase-admin');

// Firebase Admin SDK 初期化
// GOOGLE_APPLICATION_CREDENTIALS 環境変数からサービスアカウントキーのパスを読み込む
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault()
    });
    console.log("Firebase Admin SDK initialized successfully.");
} else {
    console.warn("WARNING: GOOGLE_APPLICATION_CREDENTIALS is not set. Firebase Admin SDK will not be initialized.");
    console.warn("Account deletion and other Firebase Admin functions will not work.");
}

let markedInstance; // markedのインスタンスを保持する変数

// --- CSV Data Loading ---
async function loadCsvData() {
    const records = [];
    const parser = fs
        .createReadStream(path.join(__dirname, '../SC_Security.csv'))
        .pipe(parse({
            columns: true,
            skip_empty_lines: true,
            trim: true,
        }));

    for await (const record of parser) {
        records.push(record);
    }
    return records;
}

const app = express();
const port = process.env.PORT || 3001; // 環境変数からポートを取得、なければ3001

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const DATABASE_URL = process.env.DATABASE_URL;

const sequelize = DATABASE_URL
  ? new Sequelize(DATABASE_URL, {
      dialect: 'postgres',
      protocol: 'postgres',
      logging: false, // 必要に応じてtrueに変更
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false // 本番環境ではtrueに設定することを推奨
        }
      }
    })
  : new Sequelize({
      dialect: 'sqlite',
      storage: path.join(__dirname, 'database.sqlite'),
      logging: false, // 必要に応じてtrueに変更
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
});

const User = sequelize.define('User', {
    firebaseUid: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        primaryKey: true
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true, // ゲストユーザー(emailなし)を許可するためtrueに変更
        unique: true
    },
    companyName: {
        type: DataTypes.STRING,
        allowNull: true
    }
});

const Answer = sequelize.define('Answer', {
    evaluationSetId: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: {
            model: 'EvaluationSets', // This is the table name, not the model name
            key: 'evaluationSetId',
        }
    },
    requirement_id: {
        type: DataTypes.STRING,
        primaryKey: true,
    },
    criterion_id: {
        type: DataTypes.STRING,
        primaryKey: true,
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false
    },
    notes: {
        type: DataTypes.TEXT
    }
});

const AIAdvice = sequelize.define('AIAdvice', {
    evaluationSetId: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: {
            model: 'EvaluationSets', // This is the table name, not the model name
            key: 'evaluationSetId',
        }
    },
    requirement_id: {
        type: DataTypes.STRING,
        primaryKey: true,
    },
    criterion_id: {
        type: DataTypes.STRING,
        primaryKey: true,
    },
    advice_text: {
        type: DataTypes.TEXT,
        allowNull: false
    },
}, {
    timestamps: true // Automatically add createdAt and updatedAt fields
});

const EvaluationSet = sequelize.define('EvaluationSet', {
    evaluationSetId: {
        type: DataTypes.UUID, // Using UUID for unique IDs
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'active', // e.g., 'active', 'completed'
        allowNull: false,
    },
    firebaseUid: { // Link to the user who owns this evaluation set
        type: DataTypes.STRING,
        allowNull: false,
    },
}, {
    timestamps: true,
});

const ActionItem = sequelize.define('ActionItem', {
    actionItemId: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    evaluationSetId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'EvaluationSets',
            key: 'evaluationSetId',
        }
    },
    requirement_id: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    criterion_id: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    taskDescription: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    assignee: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    dueDate: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '未着手', // e.g., '未着手', '進行中', '完了'
    },
}, {
    timestamps: true,
});

// Associations
EvaluationSet.hasMany(Answer, { foreignKey: 'evaluationSetId', onDelete: 'CASCADE' });
Answer.belongsTo(EvaluationSet, { foreignKey: 'evaluationSetId' });

EvaluationSet.hasMany(AIAdvice, { foreignKey: 'evaluationSetId', onDelete: 'CASCADE' });
AIAdvice.belongsTo(EvaluationSet, { foreignKey: 'evaluationSetId' });

EvaluationSet.hasMany(ActionItem, { foreignKey: 'evaluationSetId', onDelete: 'CASCADE' });
ActionItem.belongsTo(EvaluationSet, { foreignKey: 'evaluationSetId' });

User.hasMany(EvaluationSet, { foreignKey: 'firebaseUid', onDelete: 'CASCADE' });
EvaluationSet.belongsTo(User, { foreignKey: 'firebaseUid' });

// 複合外部キーを持つ関連付けを定義
Criterion.hasMany(ActionItem, {
    foreignKey: ['requirement_id', 'criterion_id'],
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});
ActionItem.belongsTo(Criterion, {
    foreignKey: ['requirement_id', 'criterion_id'],
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});

// Answer と Criterion の関連付け
Answer.belongsTo(Criterion, {
    foreignKey: ['requirement_id', 'criterion_id'],
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});
Criterion.hasMany(Answer, {
    foreignKey: ['requirement_id', 'criterion_id'],
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});

// AIAdvice と Criterion の関連付け
AIAdvice.belongsTo(Criterion, {
    foreignKey: ['requirement_id', 'criterion_id'],
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});
Criterion.hasMany(AIAdvice, {
    foreignKey: ['requirement_id', 'criterion_id'],
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});




// --- Handlebars Helpers ---
handlebars.registerHelper('formatDate', function(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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
    // markedInstanceがロードされていることを前提とする
    return new handlebars.SafeString(markedInstance(markdownText));
});


// AI Advice function using Google Gemini API
async function getAIAdvice(prompt) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set in .env");
    }

//    const MODEL_NAME = "models/gemini-pro-latest";
    const MODEL_NAME = process.env.GEMINI_MODEL_NAME || "models/gemini-2.5-flash";
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;



    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [{ text: prompt }]
                    }
                ],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 8192,
                },
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
                ],
            }),
        });

        if (!response.ok) {
            if (response.status === 503) {
                throw new Error('SERVICE_UNAVAILABLE');
            }
            const errorText = await response.text();
            console.error("DEBUG: Raw API Error Response Text:", errorText);
            throw new Error(`Gemini API responded with status ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (data.candidates && data.candidates.length > 0) {
            const candidate = data.candidates[0];
            if (candidate.finishReason === 'MAX_TOKENS') {
                throw new Error('MAX_TOKENS');
            }
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0 && candidate.content.parts[0].text) {
                return candidate.content.parts[0].text;
            }
        }
        
        // If no valid text is found for other reasons (e.g., safety block without MAX_TOKENS)
        console.warn("Gemini API returned a 200 OK response but with no valid content. Full response:", JSON.stringify(data, null, 2));
        return '';

    } catch (error) {
        // Re-throw specific errors or a generic one for other network issues
        throw error;
    }
}


// --- API Endpoints ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is healthy' });
});

// 新しいエンドポイントを追加
app.get('/api/gemini/models', async (req, res) => {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not set in .env" });
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini ListModels API responded with status ${response.status}: ${JSON.stringify(errorData)}`);
        }
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("Error calling Gemini ListModels API:", error);
        res.status(500).json({ error: `Failed to fetch Gemini models: ${error.message}` });
    }
});

app.get('/api/criteria', async (req, res) => {
  try {
    const criteria = await Criterion.findAll({
        order: [['criterion_id', 'ASC']]
    });
    res.json(criteria);
  } catch (error) {
    console.error('Error fetching criteria:', error);
    res.status(500).json({ error: 'Failed to fetch criteria' });
  }
});



app.post('/api/users', async (req, res) => {
    try {
        const { firebaseUid, email, companyName } = req.body;
        // 必須チェック: emailはゲストの場合ない可能性があるのでチェックしない
        if (!firebaseUid) {
            return res.status(400).json({ error: 'Missing required fields: firebaseUid' });
        }

        // ゲストログイン時、空文字("")が送られてくる場合があるため、nullに変換する
        // これにより、Unique制約(重複チェック)でエラーになるのを防ぐ
        const emailToSave = email || null;

        const [user, created] = await User.findOrCreate({
            where: { firebaseUid },
            defaults: { email: emailToSave, companyName }
        });

        // 既存ユーザーの更新処理
        if (!created) {
            // メールアドレスが新たに設定された場合(ゲスト->登録など)のみ更新
            if (emailToSave && user.email !== emailToSave) {
                user.email = emailToSave;
            }
            if (companyName && !user.companyName) {
                user.companyName = companyName;
            }
            await user.save();
        }
        res.status(created ? 201 : 200).json(user);
    } catch (error) {
        console.error('Error in /api/users endpoint:', error);
        res.status(500).json({ error: 'Failed to process user' });
    }
});

// DELETE endpoint for user and associated data
app.delete('/api/users/:firebaseUid', async (req, res) => {
    const { firebaseUid } = req.params;
    
    // --- Security Check ---
    const idToken = req.headers.authorization?.split('Bearer ')[1];
    if (!idToken) {
        return res.status(401).json({ error: 'Unauthorized: No ID token provided.' });
    }
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        if (decodedToken.uid !== firebaseUid) {
            return res.status(403).json({ error: 'Forbidden: You can only delete your own account.' });
        }
    } catch (error) {
        console.error('Error verifying Firebase ID token:', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid ID token.' });
    }
    // --- End Security Check ---

    const transaction = await sequelize.transaction();

    try {
        // Find the user in our database to ensure they exist.
        const user = await User.findOne({
            where: { firebaseUid: firebaseUid },
            transaction
        });

        // If the user exists in our database, delete their associated data first.
        if (user) {
            // Explicitly delete all evaluation sets associated with the user.
            // The cascade from EvaluationSet to its children (Answers, ActionItems, etc.) will be triggered.
            await EvaluationSet.destroy({
                where: { firebaseUid: user.firebaseUid },
                transaction
            });
            console.log(`Explicitly deleted EvaluationSets for user ${firebaseUid}.`);

            // Now, delete the user record itself.
            await user.destroy({ transaction });
            console.log(`Successfully deleted user ${firebaseUid} from the database.`);
        } else {
            console.warn(`User with firebaseUid ${firebaseUid} was not found in the database, but proceeding with Firebase Auth deletion.`);
        }

        // After successfully handling our database, delete the user from Firebase Authentication.
        await admin.auth().deleteUser(firebaseUid);
        console.log(`Successfully deleted user ${firebaseUid} from Firebase Authentication.`);
        
        // If all operations were successful, commit the transaction.
        await transaction.commit();

        res.status(200).json({ message: 'User account and all associated data deleted successfully.' });

    } catch (error) {
        // If any error occurred, roll back the transaction.
        await transaction.rollback();

        console.error(`Critical error during deletion for user ${firebaseUid}:`, error);
        if (error.code === 'auth/user-not-found') {
            return res.status(404).json({ error: 'User not found in Firebase Authentication.' });
        }
        res.status(500).json({ error: 'A server error occurred during the account deletion process.' });
    }
});

// Get all evaluation sets for a user
app.get('/api/evaluationsets/:firebaseUid', async (req, res) => {
    try {
        const { firebaseUid } = req.params;
        const evaluationSets = await EvaluationSet.findAll({
            where: { firebaseUid },
            order: [['createdAt', 'DESC']]
        });
        res.json(evaluationSets);
    } catch (error) {
        console.error('Error fetching evaluation sets:', error);
        res.status(500).json({ error: 'Failed to fetch evaluation sets' });
    }
});

// Get a single evaluation set by ID
app.get('/api/evaluationset/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const evaluationSet = await EvaluationSet.findByPk(id);
        if (!evaluationSet) {
            return res.status(404).json({ error: 'EvaluationSet not found' });
        }
        res.json(evaluationSet);
    } catch (error) {
        console.error('Error fetching evaluation set:', error);
        res.status(500).json({ error: 'Failed to fetch evaluation set' });
    }
});

// Create a new evaluation set
app.post('/api/evaluationsets', async (req, res) => {
    try {
        const { firebaseUid, name, description } = req.body;
        if (!firebaseUid || !name) {
            return res.status(400).json({ error: 'Missing required fields: firebaseUid, name' });
        }

        // Check for duplicate name for the same user
        const existingSet = await EvaluationSet.findOne({
            where: {
                firebaseUid: firebaseUid,
                name: name
            }
        });

        if (existingSet) {
            return res.status(409).json({ error: '同名の評価セットは既に存在します。別の名前を指定してください。' });
        }

        const evaluationSet = await EvaluationSet.create({ firebaseUid, name, description });
        res.status(201).json(evaluationSet);
    } catch (error) {
        console.error('Error creating evaluation set:', error);
        res.status(500).json({ error: 'Failed to create evaluation set' });
    }
});

// Update an evaluation set
app.put('/api/evaluationsets/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, status } = req.body;
        const evaluationSet = await EvaluationSet.findByPk(id);
        if (!evaluationSet) {
            return res.status(404).json({ error: 'EvaluationSet not found' });
        }
        // Add authorization check here if needed, e.g., check if user owns this set
        evaluationSet.name = name ?? evaluationSet.name;
        evaluationSet.description = description ?? evaluationSet.description;
        evaluationSet.status = status ?? evaluationSet.status;
        await evaluationSet.save();
        res.json(evaluationSet);
    } catch (error) {
        console.error('Error updating evaluation set:', error);
        res.status(500).json({ error: 'Failed to update evaluation set' });
    }
});

// Delete an evaluation set
app.delete('/api/evaluationsets/:evaluationSetId', async (req, res) => {
    try {
        const { evaluationSetId } = req.params;
        // Assuming firebaseUid is passed in headers or body for authorization
        // For simplicity, we'll assume the user is authenticated and their UID is available
        // In a real app, you'd get firebaseUid from a JWT or session
        const { firebaseUid } = req.body; // Or from a middleware that extracts it from auth token

        if (!firebaseUid) {
            return res.status(401).json({ error: 'Unauthorized: firebaseUid missing for authorization.' });
        }

        const evaluationSet = await EvaluationSet.findByPk(evaluationSetId);

        if (!evaluationSet) {
            return res.status(404).json({ error: 'EvaluationSet not found.' });
        }

        // Authorization check: ensure the user owns this evaluation set
        if (evaluationSet.firebaseUid !== firebaseUid) {
            return res.status(403).json({ error: 'Forbidden: You do not own this evaluation set.' });
        }

        await evaluationSet.destroy(); // onDelete: 'CASCADE' will handle Answers and AIAdvice

        res.status(204).send(); // No content to send back, just success
    } catch (error) {
        console.error('Error deleting evaluation set:', error);
        res.status(500).json({ error: 'Failed to delete evaluation set.' });
    }
});


app.post('/api/answers', async (req, res) => {
    try {
        const { evaluationSetId, requirement_id, criterion_id, status, notes } = req.body;
        if (!evaluationSetId || !requirement_id || !criterion_id || !status) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const [answer, created] = await Answer.findOrCreate({
            where: { evaluationSetId, requirement_id, criterion_id },
            defaults: { status, notes }
        });

        if (!created) {
            answer.status = status;
            answer.notes = notes;
            await answer.save();
        }
        res.status(created ? 201 : 200).json(answer);
    } catch (error) {
        console.error('Error saving answer:', error);
        res.status(500).json({ error: 'Failed to save answer' });
    }
});

app.get('/api/answers/:evaluationSetId', async (req, res) => {
    try {
        const { evaluationSetId } = req.params;
        
        const answers = await Answer.findAll({
            where: { evaluationSetId },
            order: [['requirement_id', 'ASC'], ['criterion_id', 'ASC']],
            raw: true
        });

        const advices = await AIAdvice.findAll({
            where: { evaluationSetId },
            raw: true
        });

        const adviceMap = new Map();
        advices.forEach(advice => {
            const key = `${advice.evaluationSetId}-${advice.requirement_id}-${advice.criterion_id}`;
            adviceMap.set(key, advice);
        });

        const combinedData = answers.map(answer => {
            const key = `${answer.evaluationSetId}-${answer.requirement_id}-${answer.criterion_id}`;
            return {
                ...answer,
                advice: adviceMap.get(key) || null
            };
        });

        res.json(combinedData);
    } catch (error) {
        console.error('Error fetching answers:', error);
        res.status(500).json({ error: 'Failed to fetch answers' });
    }
});

app.post('/api/ai/advice', async (req, res) => {
    const { evaluationSetId, requirement_id, criterion_id, requirementText, criterionText, notes } = req.body;

    if (!evaluationSetId || !requirement_id || !criterion_id || !requirementText || !criterionText) {
        return res.status(400).json({ error: 'Missing required fields for generating advice.' });
    }

    // Ensure the parent Answer record exists
    await Answer.findOrCreate({
        where: { evaluationSetId, requirement_id, criterion_id },
        defaults: { status: '未評価', notes: notes || '' }
    });

    // Helper function to generate the prompt
    const buildPrompt = (includeNotes) => {
        const promptCore = [
            'あなたはITセキュリティを専門とするコンサルタントです。',
            '組織の担当者にも分かりやすいように、以下のセキュリティ要件を達成するための具体的な改善計画を提案してください。',
            '',
            '# セキュリティ要求事項',
            requirementText,
            '',
            '# 未達成の評価基準',
            criterionText,
        ];
        if (includeNotes && notes) {
            promptCore.push('', '# ユーザーによる補足情報（備考）', notes);
        }
        const promptInstructions = [
            '',
            '# 禁止事項 (最重要)',
            '- **「中小企業」という単語は絶対に使用しないでください。** 代わりに「組織」や「企業」といった一般的な単語を使用してください。',
            '- **「〇〇社」のような、架空の企業名や個人名を例として使用しないでください。**',
            '- **参考情報のURLは記載しないでください。** 代わりに、参考となる文書の正式名称（発行元を含む）を正確に記載してください。',
            '',
            '# 指示',
            '上記の要求事項、評価基準、補足情報を踏まえ、**禁止事項を厳守した上で**、評価基準を「達成」にするための具体的で実行可能なアクションプランを提案してください。',
            '',
            '## 回答形式',
            '- 全体はマークダウン形式で記述してください。',
            '- アクションプランは、具体的な手順が分かるようにリスト形式で記述してください。',
            '- **太字にする場合は、必ずアスタリスク2つ（`**`）でテキストを囲んでください。（例： **重要なポイント** のように、アスタリスク2つで囲みます）**',
            '- 表形式で回答する場合は、必ずMarkdownのテーブル記法に沿って、ヘッダーと区切り線を正しく記述し、レイアウトが崩れないようにしてください。',
            '',
            '## 参考情報に関する厳格な指示',
            '- 参考となる情報源を提示する場合は、以下の条件を必ず満たしてください。',
            '  - 情報の鮮度: できる限り最新の情報（可能であれば過去2-3年以内に公開・更新されたもの）を優先してください。',
            '  - 信頼性: リンク切れがなく、信頼性の高い公式な一次情報源（例: 政府機関、NIST、IPA、JPCERT/CC、主要な技術ベンダーの公式ドキュメントなど）のURLを記載してください。',
            '  - 具体性: IPAのウェブサイトを参照する場合は、トップページではなく、具体的なガイドラインや報告書のページを直接指定してください。',
            '  - 検証: 提示するURLが現在アクセス可能であることを確認するよう努めてください。もし確実なURLが見つからない場合は、無理にURLを記載せず、代わりに検索キーワードや参照すべき文書名を正確に提示してください。'
        ];
        return [...promptCore, ...promptInstructions].join('\n');
    };

    try {
        // --- Attempt 1: Full prompt (with notes) ---
        const fullPrompt = buildPrompt(true);
        let adviceText = await getAIAdvice(fullPrompt);

        // --- Upsert and respond ---
        await AIAdvice.upsert({
            evaluationSetId,
            requirement_id,
            criterion_id,
            advice_text: adviceText
        });
        const newAdvice = await AIAdvice.findOne({ where: { evaluationSetId, requirement_id, criterion_id } });
        res.json(newAdvice);

    } catch (error) {
        // --- Handle specific errors from getAIAdvice ---
        if (error.message === 'MAX_TOKENS') {
            console.log('MAX_TOKENS error on first attempt. Retrying without notes...');
            try {
                // --- Attempt 2: Fallback prompt (without notes) ---
                const simplePrompt = buildPrompt(false);
                let adviceText = await getAIAdvice(simplePrompt);

                // Prepend disclaimer
                const disclaimer = `**[ご注意]** 生成するアドバイスが長くなりすぎたため、備考欄の情報は考慮されていません。

---

`;
                adviceText = disclaimer + adviceText;

                await AIAdvice.upsert({
                    evaluationSetId,
                    requirement_id,
                    criterion_id,
                    advice_text: adviceText
                });
                const newAdvice = await AIAdvice.findOne({ where: { evaluationSetId, requirement_id, criterion_id } });
                return res.json(newAdvice);

            } catch (fallbackError) {
                console.error('Error on fallback attempt:', fallbackError);
                // If even the fallback fails, send a final error message
                return res.status(500).json({
                    error: 'MAX_TOKENS_FALLBACK_FAILED',
                    message: 'AIが応答を生成できませんでした。要求が複雑すぎる可能性があります。'
                });
            }
        } else if (error.message === 'SERVICE_UNAVAILABLE') {
            return res.status(503).json({
                error: 'SERVICE_UNAVAILABLE',
                message: 'AIモデルが混み合っています。しばらく時間をおいてから、再度お試しください。'
            });
        } else {
            // Generic error for any other case
            console.error('Error getting AI advice:', error);
            return res.status(500).json({
                error: 'INTERNAL_SERVER_ERROR',
                message: 'AIアドバイスの生成中に不明なエラーが発生しました。'
            });
        }
    }
});

// --- ActionItem API Endpoints ---

// Get all action items for an evaluation set
app.get('/api/actionitems/:evaluationSetId', async (req, res) => {
    try {
        const { evaluationSetId } = req.params;
        const actionItems = await ActionItem.findAll({
            where: { evaluationSetId },
            order: [['createdAt', 'ASC']]
        });
        res.json(actionItems);
    } catch (error) {
        console.error('Error fetching action items:', error);
        res.status(500).json({ error: 'Failed to fetch action items' });
    }
});

// Create a new action item
app.post('/api/actionitems', async (req, res) => {
    try {
        const { evaluationSetId, requirement_id, criterion_id, taskDescription, assignee, dueDate, status } = req.body;
        if (!evaluationSetId || !requirement_id || !criterion_id || !taskDescription) {
            return res.status(400).json({ error: 'Missing required fields: evaluationSetId, requirement_id, criterion_id, taskDescription' });
        }
        const actionItem = await ActionItem.create({ evaluationSetId, requirement_id, criterion_id, taskDescription, assignee, dueDate, status });
        res.status(201).json(actionItem);
    } catch (error) {
        console.error('Error creating action item:', error);
        res.status(500).json({ error: 'Failed to create action item' });
    }
});

// Update an action item
app.put('/api/actionitems/:actionItemId', async (req, res) => {
    try {
        const { actionItemId } = req.params;
        const { taskDescription, assignee, dueDate, status } = req.body;
        const actionItem = await ActionItem.findByPk(actionItemId);
        if (!actionItem) {
            return res.status(404).json({ error: 'ActionItem not found' });
        }
        // TODO: Add authorization check if needed
        actionItem.taskDescription = taskDescription ?? actionItem.taskDescription;
        actionItem.assignee = assignee ?? actionItem.assignee;
        actionItem.dueDate = dueDate ?? actionItem.dueDate;
        actionItem.status = status ?? actionItem.status;
        await actionItem.save();
        res.json(actionItem);
    } catch (error) {
        console.error('Error updating action item:', error);
        res.status(500).json({ error: 'Failed to update action item' });
    }
});

// Delete an action item
app.delete('/api/actionitems/:actionItemId', async (req, res) => {
    try {
        const { actionItemId } = req.params;
        const actionItem = await ActionItem.findByPk(actionItemId);
        if (!actionItem) {
            return res.status(404).json({ error: 'ActionItem not found' });
        }
        // TODO: Add authorization check if needed
        await actionItem.destroy();
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting action item:', error);
        res.status(500).json({ error: 'Failed to delete action item' });
    }
});


// --- PDF Report Generation ---

// Helper function for escapeHtml
function escapeHtml(text) {
    if (text === null || text === undefined) {
      return '';
    }
    return text.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
}

// Helper function to get status colors for PDF
function getStatusColor(status) {
    switch (status) {
        case '達成': return '#28a745'; // green
        case '未達成': return '#dc3545'; // red
        case '一部達成': return '#ffc107'; // yellow
        case '該当なし': return '#6c757d'; // gray
        case '未評価': return '#f8f9fa'; // light gray
        default: return '#ffffff'; // white
    }
}

// Function to generate the report HTML
function generatePdfHtml(requirements, evaluationSetName) {
    let body = '';

    // Helper to safely get Category 1 No
    const getCat1No = (cat1Key) => {
        const cat1Data = requirements[cat1Key];
        if (!cat1Data) return 999;
        const cat2Keys = Object.keys(cat1Data);
        if (cat2Keys.length === 0) return 999;
        const reqs = cat1Data[cat2Keys[0]];
        if (!reqs || reqs.length === 0) return 999;
        return parseInt(reqs[0].category1_no || '999', 10);
    };

    // Sort category1 keys
    const sortedCat1Keys = Object.keys(requirements).sort((a, b) => {
        return getCat1No(a) - getCat1No(b);
    });

    for (const category1 of sortedCat1Keys) {
        const subCategories = requirements[category1];
        // Get category1_no safely
        const cat1No = getCat1No(category1);
        const displayCat1No = cat1No === 999 ? '' : `${cat1No}. `;
        
        body += `<div class="category-group"><h1>${escapeHtml(displayCat1No)}${escapeHtml(category1)}</h1>`;
        
        // Helper to safely get Category 2 No
        const getCat2No = (cat2Key) => {
            const reqs = subCategories[cat2Key];
            if (!reqs || reqs.length === 0) return '999';
            return reqs[0].category2_no || '999';
        };

        // Sort category2 keys
        const sortedCat2Keys = Object.keys(subCategories).sort((a, b) => {
            return getCat2No(a).localeCompare(getCat2No(b), undefined, { numeric: true, sensitivity: 'base' });
        });

        for (const category2 of sortedCat2Keys) {
            const reqs = subCategories[category2];
            if (!reqs || reqs.length === 0) continue; // Skip if empty

            const cat2No = getCat2No(category2);
            const displayCat2No = cat2No === '999' ? '' : `${cat2No}. `;

            body += `<div class="subcategory-group"><h2>${escapeHtml(displayCat2No)}${escapeHtml(category2)}</h2>`;
            for (const req of reqs) {
                const reqName = req.name ? `【${escapeHtml(req.name)}】<br/>` : '';
                body += `
                    <div class="requirement">
                        <h3>${escapeHtml(req.id)}. ${reqName}${escapeHtml(req.text)}</h3>
                        <table class="criteria-table">
                            <colgroup>
                                <col style="width: 8%;">
                                <col style="width: 10%;">
                                <col style="width: 44%;">
                                <col style="width: 8%;">
                                <col style="width: 30%;">
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>★3/★4</th>
                                    <th>評価基準No.</th>
                                    <th>評価基準</th>
                                    <th>評価</th>
                                    <th>備考</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${req.criteria.map(criterion => `
                                    <tr>
                                        <td style="text-align: center;">
                                            ★${criterion.star_level}
                                        </td>
                                        <td style="text-align: center;">
                                            ${escapeHtml(criterion.criterion_id)}
                                        </td>
                                        <td>${escapeHtml(criterion.criterion_text)}</td>
                                        <td>
                                            <span class="status-badge" style="background-color: ${getStatusColor(criterion.status)}; color: ${criterion.status === '未評価' ? '#000' : '#fff'};">
                                                ${escapeHtml(criterion.status)}
                                            </span>
                                        </td>
                                        <td class="notes">${escapeHtml(criterion.notes).replace(/\n/g, '<br>') }</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
            body += `</div>`; // end subcategory-group
        }
        body += `</div>`; // end category-group
    }

    return `
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <title>セキュリティ評価レポート</title>
            <style>
                body {
                    font-family: 'Noto Sans CJK JP', 'Helvetica', 'Arial', sans-serif;
                    -webkit-print-color-adjust: exact;
                    color-adjust: exact;
                    font-size: 12px;
                }
                h1 {
                    font-size: 18px;
                    text-align: left;
                    border-bottom: 2px solid #333;
                    padding-bottom: 5px;
                    margin-top: 20px;
                    margin-bottom: 10px;
                    page-break-after: avoid;
                }
                h2 {
                    font-size: 15px;
                    background-color: #f0f0f0;
                    padding: 5px 10px;
                    border-radius: 4px;
                    margin-top: 15px;
                    margin-bottom: 8px;
                    page-break-after: avoid;
                }
                h3 {
                    font-size: 13px;
                    margin-top: 10px;
                    margin-bottom: 5px;
                    border-left: 4px solid #007bff;
                    padding-left: 8px;
                    page-break-after: avoid;
                }
                .report-date { text-align: right; color: #555; margin-bottom: 20px; font-size: 10px; }
                .report-title-section { text-align: center; margin-bottom: 30px; }
                .report-title-section h1 { 
                    border: none; 
                    font-size: 24px; 
                    text-align: center; 
                    margin-bottom: 10px; 
                }
                .evaluation-set-name {
                    font-size: 16px;
                    font-weight: bold;
                    color: #007bff;
                    margin-bottom: 10px;
                }

                .category-group { margin-bottom: 20px; }
                .subcategory-group { margin-bottom: 15px; }
                .requirement { page-break-inside: avoid; margin-bottom: 10px; }

                .criteria-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 10px;
                    table-layout: fixed; /* 固定幅レイアウト */
                }
                .criteria-table th, .criteria-table td {
                    border: 1px solid #ddd;
                    padding: 5px;
                    text-align: left;
                    vertical-align: top;
                    word-wrap: break-word; /* 長い単語の折り返し */
                }
                .criteria-table th { background-color: #f9f9f9; }
                .status-badge {
                    display: inline-block;
                    padding: 2px 5px;
                    border-radius: 3px;
                    font-size: 9px;
                    white-space: nowrap;
                }
                .notes {
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }
            </style>
        </head>
        <body>
            <div class="report-title-section">
                <h1>セキュリティ評価レポート</h1>
                <div class="evaluation-set-name">評価セット: ${escapeHtml(evaluationSetName)}</div>
                <p class="report-date">作成日: ${new Date().toLocaleDateString('ja-JP')}</p>
            </div>
            ${body}
        </body>
        </html>
    `;
}
app.post('/api/report/pdf', async (req, res) => {
    const { requirements, evaluationSetName } = req.body;
    if (!requirements) {
        return res.status(400).send({ error: 'Invalid data format: requirements data is missing.' });
    }

    let browser;
    const tempFileName = `report-${Date.now()}.pdf`;
    const tempFilePath = path.join(__dirname, tempFileName);

                        try {

                            const htmlContent = generatePdfHtml(requirements, evaluationSetName || '');

                            

                            browser = await puppeteer.launch({

                                headless: true,

                                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',

                                args: [

                                    '--no-sandbox',

                                    '--disable-setuid-sandbox',

                                    '--disable-dev-shm-usage', // Docker環境でのメモリクラッシュ防止

                                    '--disable-gpu',           // GPU無効化（サーバー負荷軽減）

                                    '--no-first-run',

                                ],

                                protocolTimeout: 300000 // タイムアウトを300秒(5分)に延長

                            });

                            const page = await browser.newPage();

                            

                            await page.setContent(htmlContent, { 

                                waitUntil: 'networkidle0',

                                timeout: 300000 // コンテンツ読み込みタイムアウトを300秒に延長

                            });

                        

                            await page.pdf({

                                path: tempFilePath,

                                format: 'Letter',

                                printBackground: false,

                                margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },

                                timeout: 300000 // PDF生成タイムアウトを300秒に延長

                            });

                    

                            res.sendFile(tempFilePath, { headers: { 'Content-Disposition': 'attachment; filename=security-report.pdf' } }, (err) => {            if (err) {
                console.error('Error sending file:', err);
                if (!res.headersSent) {
                    res.status(500).send({ error: 'Failed to send PDF file.' });
                }
            }
            // Clean up the temporary file
            fs.unlink(tempFilePath, (unlinkErr) => {
                if (unlinkErr) {
                    console.error('Error deleting temporary PDF file:', unlinkErr);
                }
            });
        });

    } catch (error) {
        console.error('Error generating PDF report:', error);
        if (!res.headersSent) {
            res.status(500).send({ error: 'Failed to generate PDF report' });
        }
        // Clean up temp file in case of error during generation
        fs.unlink(tempFilePath, (unlinkErr) => {
            if (unlinkErr && unlinkErr.code !== 'ENOENT') { // Ignore if file doesn't exist
                console.error('Error deleting temporary PDF file after failure:', unlinkErr);
            }
        });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

// --- Server Initialization & Data Seeding ---
async function setupAndStartServer() {
  try {
    console.log("Step 1: Starting setup...");
    const shouldForceSync = process.env.DB_RESET === 'true';
    if (shouldForceSync) {
      console.log("Step 1.5: DB_RESET is true. Forcing database sync (dropping all tables)...");
      await sequelize.sync({ force: true });
    } else {
      console.log("Step 1.5: Syncing database (creating tables if not exist, no alteration)...");
      await sequelize.sync();
    }
    console.log("Step 2: Database & tables synced!");

    const count = await Criterion.count();
    console.log(`Step 3: Found ${count} existing criteria.`);

    if (count === 0) {
      console.log("Step 4: Seeding new data from CSV...");
      const rawCsvRecords = await loadCsvData();
      const seedData = [];
      for (const row of rawCsvRecords) {
        if (!row['requirement_id'] || !row['requirement_text'] || isNaN(parseInt(row.star_level, 10))) {
            continue; 
        }
        seedData.push(row);
      }

      await Criterion.bulkCreate(seedData);
      console.log(`Step 5: Seeding completed! ${seedData.length} criteria loaded.`);
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
app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});
