import { PrismaClient } from '@prisma/client';
import { WebClient } from '@slack/web-api';
import { NextApiRequest, NextApiResponse } from 'next';

const prisma = new PrismaClient();
const token = process.env.SLACK_BOT_TOKEN;
const slackClient = new WebClient(token);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const payload = JSON.parse(req.body.payload);
  if (payload.type === 'view_submission') {
    const values = payload.view.state.values;

    const userId = payload.user.id;
    const channelId = payload.channel.id;
    const assignedUsers = values.who.who_select.selected_users;
    const title = values.title.title_input.value;
    const description = values.description.desc_input.value;
    const dueDate = values.when.when_input.value;
    const reminderInterval = values.remind?.remind_input?.value
      ? parseInt(values.remind.remind_input.value)
      : null;

    // DBにタスクを追加
    const task = await prisma.task.create({
      data: {
        channelId,
        createdBy: userId,
        title,
        description,
        dueDate: new Date(dueDate),
        reminderInterval,
        status: 'open',
        assignments: {
          create: assignedUsers.map((id: string) => ({ userId: id })),
        },
      },
    });
    console.log(`tasks:${task}`);

    await slackClient.chat.postMessage({
      channel: channelId,
      text: `✅ タスクが作成されました: *${title}* (締切: ${dueDate})`,
    });

    return res.status(200).json({ response_action: 'clear' });
  }

  return res.status(400).send('Invalid request');
}
