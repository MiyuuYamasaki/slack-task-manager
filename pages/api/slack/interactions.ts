import { PrismaClient } from '@prisma/client';
import { WebClient } from '@slack/web-api';
import { NextApiRequest, NextApiResponse } from 'next';
import { handleSubmission } from '@/utils/handleSubmission';

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

  // const payload = JSON.parse(req.body.payload);
  // const { user, view } = req.body;
  const payload = JSON.parse(req.body.payload);

  console.log(payload);

  if (payload.type === 'view_submission') {
    try {
      const view = payload.view;
      const user_id = view.id;
      // const values = payload.view.state.values;
      // 🔹 handleSubmission でモーダルのデータを取得

      const taskData = handleSubmission(view);
      // const userId = payload.user.id;
      const channel_id = view.private_metadata.channelId;

      console.log(`channel_id:${channel_id}`);

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
          // assignments: {
          //   create: taskData.assignedUsers.map((id: string) => ({
          //     userId: id,
          //   })),
          // },
        },
      });
      console.log(`tasks:${task}`);

      // 日本のタイムゾーンでフォーマット
      const formattedDate = taskData.dueDate.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short', // 「日」,「月」,「火」, ...
      });

      await slackClient.chat.postMessage({
        channel: channel_id,
        text: `✅ タスクを作成しました: to @${taskData.assignedUsers} \n*${taskData.title}* (締切: ${formattedDate}) by @${user_id}`,
      });
      return res.json({ response_action: 'clear' }); // モーダルを閉じる
      // return res.status(200).json({ response_action: 'clear' });
    } catch (error) {
      console.error('エラー:', error);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  }

  res.status(400).json({ message: 'Bad Request' });
}
