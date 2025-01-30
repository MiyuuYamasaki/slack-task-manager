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
  const { text, user_id, trigger_id, channel_id } = req.body;

  if (!text) {
    // 🟢 引数なし → モーダル表示
    await slackClient.views.open({
      trigger_id,
      view: {
        type: 'modal',
        callback_id: 'task_modal',
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
    // 🟠 引数あり → 直接DB追加
    // const args = text.split(' ');

    // テキストをカンマで分割
    const args = text.split(',');
    if (args.length < 3) {
      return res.status(400).send('入力が不足しています。');
    }

    // 各変数に代入
    const mention = args[0].split(' ').slice(1); // スラッシュの後のユーザー名部分
    const title = args[1].trim(); // タイトル
    const dueDate = new Date(args[2].trim()); // 期限（日付形式に変換）
    const description = args[3].trim(); // 説明
    const reminderInterval = isNaN(Number(args[4])) ? null : Number(args[4]); // リマインダー間隔

    // const mention = args[0]; // @username
    // const title = args[1];
    // const dueDate = args[2];
    // const description = args.slice(3, args.length - 1).join(' ');
    // const reminderInterval = isNaN(Number(args[args.length - 1]))
    //   ? null
    //   : Number(args[args.length - 1]);

    // 結果の確認
    console.log(mention); // ["@山﨑 美優", "@親富祖 一"]
    console.log(title); // "title"
    console.log(dueDate); // "2025-01-31"（Dateオブジェクト）
    console.log(description); // "description"
    console.log(reminderInterval); // 3

    const userId = mention.replace(/[<@>]/g, ''); // @マークを除去
    console.log('text:' + text);

    try {
      const task = await prisma.task.create({
        data: {
          channelId: channel_id,
          createdBy: user_id,
          title,
          description,
          dueDate: new Date(dueDate),
          reminderInterval,
          status: 'open',
          assignments: {
            create: [{ userId }],
          },
        },
      });
      console.log('tasks:' + task);

      await slackClient.chat.postMessage({
        channel: channel_id,
        text: `✅ タスクを作成しました: *${title}* (締切: ${dueDate})`,
      });
    } catch (error) {
      console.error('Error creating task:', error);
      return res.status(500).send('タスクの作成に失敗しました。');
    }

    return res.status(200).send('');
  }
}
