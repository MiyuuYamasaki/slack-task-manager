import { PrismaClient } from '@prisma/client';
import { WebClient } from '@slack/web-api';
import { NextApiRequest, NextApiResponse } from 'next';
import { handleSubmission } from '@/utils/handleSubmission';
import { handleFormatDate } from '@/utils/handleFormattedDate';

const prisma = new PrismaClient();
const token = process.env.SLACK_BOT_TOKEN;
const slackClient = new WebClient(token);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const payload = JSON.parse(req.body.payload);

  console.log(payload);

  if (payload.type === 'view_submission') {
    try {
      const view = payload.view;
      const user_id = payload.user.id;

      // 🔹 handleSubmission でモーダルのデータを取得
      const taskData = handleSubmission(view);
      const privateMetadata = JSON.parse(view.private_metadata);
      const channel_id = privateMetadata.channelId;

      const tasks = [];

      tasks.push(async () => {
        // 🔹 PrismaでDBにタスクを保存
        const task = await prisma.task.create({
          data: {
            channelId: channel_id, // Slackモーダルの `private_metadata` にチャンネルIDを入れておくと取得可能
            createdBy: user_id,
            title: taskData.title,
            description: taskData.description,
            dueDate: new Date(taskData.dueDate),
            reminderInterval: taskData.reminderInterval,
            status: 'open',
            assignments: {
              create: {
                users: taskData.assignedUsers,
              },
            },
          },
          include: {
            assignments: true, // 作成した TaskAssignment を返すようにする
          },
        });
        if (!task) return res.status(500).send('タスクの作成に失敗しました。');
      });

      tasks.push(async () => {
        // 日本のタイムゾーンでフォーマット
        const formattedDate = await handleFormatDate(taskData.dueDate);

        // 文字列を配列に変換し、各ユーザーIDを `<@user_id>` 形式にする
        const mentions = taskData.assignedUsers
          .map((userId: string) => `<@${userId}>`)
          .join(' ');

        await slackClient.chat.postMessage({
          channel: channel_id,
          text: `✅ タスクを作成しました: to ${mentions} \n*${taskData.title}* (締切: ${formattedDate}) by <@${user_id}>`,
        });
      });

      try {
        await Promise.all(tasks.map((task) => task())); // 🔹 `task()` を呼び出して実行
        console.log('✅ すべてのタスクが正常に完了しました');
        return res.json({ response_action: 'clear' }); // モーダルを閉じる
        // return res.status(200).send('');
      } catch (error) {
        console.error('Error creating task:', error);
        return res.status(500).send('タスクの作成に失敗しました。');
      }

      // return res.status(200).json({ response_action: 'clear' });
    } catch (error) {
      console.error('エラー:', error);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  }

  res.status(400).json({ message: 'Bad Request' });
}
