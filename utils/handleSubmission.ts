export const handleSubmission = (view: any) => {
  const values = view.state.values;

  return {
    assignedUsers: values.who.who_select.selected_users,
    title: values.title.title_input.value,
    description: values.description.desc_input.value,
    dueDate: new Date(values.when.when_picker.selected_date.trim()), // 🔹 日付選択に対応
    reminderInterval: values.remind?.remind_input?.value
      ? parseInt(values.remind.remind_input.value)
      : null,
  };
};
