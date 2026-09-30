// Fixed user roles (replaces the old group_user_id → UserGroupPermission link)
const USER_ROLES = [
  "អ្នកគ្រប់គ្រងប្រព័ន្ធមេ", // main system administrator
  "អ្នកគ្រប់គ្រងឯកសារចូល", // incoming documents manager
  "អ្នកគ្រប់គ្រងឯកសារចេញ", // outgoing documents manager
  "អ្នកគ្រប់គ្រងឯកសារចេញ/ចូល", // incoming + outgoing documents manager
];

module.exports = { USER_ROLES };
