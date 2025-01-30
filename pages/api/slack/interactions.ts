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
      // const values = payload.view.state.values;
      // 🔹 handleSubmission でモーダルのデータを取得

      const taskData = handleSubmission(payload.view);
      // const userId = payload.user.id;
      let channel_id = payload.channel.id;

      if (channel_id.startsWith('D')) {
        // DMチャンネルの場合、再度DMチャンネルを開く
        const response = await slackClient.conversations.open({
          users: payload.view.id, // 送信先のユーザーID
        });

        channel_id = response?.channel?.id; // 正しいDMチャンネルIDを取得
      }
      // const assignedUsers = values.who.who_select.selected_users;
      // const title = values.title.title_input.value;
      // const description = values.description.desc_input.value;
      // const dueDate = values.when.when_input.value;
      // const reminderInterval = values.remind?.remind_input?.value
      //   ? parseInt(values.remind.remind_input.value)
      //   : null;

      // // DBにタスクを追加
      // const task = await prisma.task.create({
      //   data: {
      //     channelId,
      //     createdBy: userId,
      //     title,
      //     description,
      //     dueDate: new Date(dueDate),
      //     reminderInterval,
      //     status: 'open',
      //     assignments: {
      //       create: assignedUsers.map((id: string) => ({ userId: id })),
      //     },
      //   },
      // });

      // 🔹 PrismaでDBにタスクを保存
      const task = await prisma.task.create({
        data: {
          channelId: payload.view.private_metadata, // Slackモーダルの `private_metadata` にチャンネルIDを入れておくと取得可能
          createdBy: payload.view.id,
          title: taskData.title,
          description: taskData.description,
          dueDate: new Date(taskData.dueDate),
          reminderInterval: taskData.reminderInterval,
          status: 'open',
          assignments: {
            create: taskData.assignedUsers.map((id: string) => ({
              userId: id,
            })),
          },
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
        text: `✅ タスクが作成されました: *${taskData.title}* (締切: ${formattedDate})`,
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
