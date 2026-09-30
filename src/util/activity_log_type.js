function activityLogType() {
  return [
    {
      id: 0,
      title: "other",
    },
    {
      id: 1,
      title: "auth",
    },
    {
      id: 2,
      title: "subject_and_time",
    },
  ];
}

module.exports = {
  activityLogType,
};
