import { WebClient } from '@slack/web-api';
import { PrismaClient } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';

const token = process.env.SLACK_BOT_TOKEN as string;
const slackClient = new WebClient(token);
const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { text, user_id, trigger_id } = req.body;
  let { channel_id } = req.body;

  if (channel_id.startsWith('D')) {
    // DMチャンネルの場合、再度DMチャンネルを開く
    const response = await slackClient.conversations.open({
      users: user_id, // 送信先のユーザーID
    });

    channel_id = response?.channel?.id; // 正しいDMチャンネルIDを取得
  }

  if (!text) {
    // 🟢 引数なし → モーダル表示
    await slackClient.views.open({
      trigger_id,
      view: {
        type: 'modal',
        callback_id: 'task_modal',
        private_metadata: JSON.stringify({ channelId: channel_id }), // ← ここに埋め込む
        title: { type: 'plain_text', text: '新しいタスク' },
        submit: { type: 'plain_text', text: '作成' },
        blocks: [
          {
            type: 'input',
            block_id: 'who',
            label: { type: 'plain_text', text: '担当者 (複数可)' },
            element: { type: 'multi_users_select', action_id: 'who_select' },
          },
          {
            type: 'input',
            block_id: 'title',
            label: { type: 'plain_text', text: 'タイトル' },
            element: { type: 'plain_text_input', action_id: 'title_input' },
          },
          {
            type: 'input',
            block_id: 'description',
            label: { type: 'plain_text', text: '詳細' },
            element: { type: 'plain_text_input', action_id: 'desc_input' },
          },
          {
            type: 'input',
            block_id: 'when',
            label: { type: 'plain_text', text: '締切日を選択' },
            element: { type: 'datepicker', action_id: 'when_picker' },
          },
          {
            type: 'input',
            block_id: 'remind',
            optional: true,
            label: {
              type: 'plain_text',
              text: 'リマインダー (開始から進捗確認する日数の間隔)',
            },
            element: { type: 'plain_text_input', action_id: 'remind_input' },
          },
        ],
      },
    });

    return res.status(200).send('');
  } else {
    const tasks = [];

    // 🟠 引数あり → 直接DB追加
    // テキストをカンマで分割
    const args = text.split(',');
    if (args.length < 3) {
      return res.status(400).send('入力が不足しています。');
    }

    // const mentions = [...args[0].matchAll(/@(\w+)/g)]; // 全メンションを取得

    // const userNames = mentions.map((mention) => mention.slice(1)); // @を取り除いてユーザー名だけにする
    // console.log('userNames:' + userNames); // 複数のユーザー名が配列で表示されます

    const users = await processTaskCommand(args, token);
    // const response = await slackClient.users.info({ user: mention });
    // const mention_user_name = response.user?.name;

    const title = args[1].trim(); // タイトル
    const dueDate = new Date(args[2].trim()); // 期限（日付形式に変換）
    const description = args[3].trim(); // 説明
    const reminderInterval = isNaN(Number(args[4])) ? null : Number(args[4]); // リマインダー間隔

    // 結果の確認
    // console.log(mention_user_name); // ["@山﨑 美優", "@親富祖 一"]

    // const userId = mention.replace(/[<@>]/g, ''); // @マークを除去
    console.log('text:' + text);

    tasks.push(async () => {
      const task = await prisma.task.create({
        data: {
          channelId: channel_id,
          createdBy: user_id,
          title,
          description,
          dueDate: new Date(dueDate),
          reminderInterval,
          status: 'open',
          // assignments: {
          //   create: [{ userId }],
          // },
        },
      });
      console.log('tasks:' + JSON.stringify(task));
    });

    tasks.push(async () => {
      // 日本のタイムゾーンでフォーマット
      const formattedDate = dueDate.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short', // 「日」,「月」,「火」, ...
      });

      await slackClient.chat.postMessage({
        channel: channel_id,
        text: `✅ タスクを作成しました: to ${users} \n*${title}* (締切: ${formattedDate}) by <@${user_id}>`,
      });
    });

    try {
      await Promise.all(tasks.map((task) => task())); // 🔹 `task()` を呼び出して実行
      console.log('✅ すべてのタスクが正常に完了しました');
    } catch (error) {
      console.error('Error creating task:', error);
      return res.status(500).send('タスクの作成に失敗しました。');
    }

    return res.status(200).send('');
  }
}

interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  is_bot?: boolean;
  deleted?: boolean;
}

async function processTaskCommand(args: string[], token: string) {
  // メンション部分を取得（最初の部分だけを取り出す）
  const mentionPart = args[0].match(/@(\w+)/g) || [];

  // ユーザーIDリストを取得
  const userIds = await Promise.all(
    mentionPart.map(async (mention) => {
      return await getUserIdByMention(mention, token);
    })
  );

  // 無効なユーザーを除外し、<@user_id> 形式にする
  const mentions = userIds
    .filter((id): id is string => id !== null)
    .map((id) => `<@${id}>`)
    .join(' ');

  console.log(`取得したメンション: ${mentions}`);

  return mentions;
}

async function getUserIdByMention(
  mention: string,
  token: string
): Promise<string | null> {
  const userName = mention.replace(/^@/, ''); // @を削除してユーザー名を取得

  const response = await fetch('https://slack.com/api/users.list', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  if (!data.ok) return null;

  const user = data.members.find(
    (member: SlackUser) => member.name === userName
  );
  return user ? user.id : null;
}
