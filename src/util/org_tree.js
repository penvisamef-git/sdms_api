// Shared builder for the organisation tree:
// Unit → General Directorate → Department → Office (→ User, optional)
// Every node: { ...fields, level, children: [] }
const GeneralDirectorateModel = require("../v1/admin/dashboard/master_data/general_directorate/model");
const DepartmentModel = require("../v1/admin/dashboard/master_data/department/model");
const OfficeModel = require("../v1/admin/dashboard/master_data/office/model");
const UserModel = require("../v1/admin/user/user.model");

const FIELDS = "name name_in_eng note status";
const USER_FIELDS = "firstname lastname email contact job_title status office_id";

function groupBy(rows, key) {
  const map = {};
  rows.forEach((row) => {
    const k = String(row[key]);
    (map[k] = map[k] || []).push(row);
  });
  return map;
}

// Users of the given offices → { officeId: [userNode] }
async function usersByOffice(officeIds) {
  const users = await UserModel.find({ office_id: { $in: officeIds }, deleted: false })
    .select(USER_FIELDS)
    .sort({ firstname: 1 })
    .lean();
  const map = groupBy(users, "office_id");
  Object.keys(map).forEach((k) => {
    map[k] = map[k].map((u) => ({ ...u, name: `${u.firstname} ${u.lastname}`, level: "user", children: [] }));
  });
  return map;
}

// Offices (filter) → [officeNode]
async function officeNodes(filter, { includeUsers = false } = {}) {
  const offices = await OfficeModel.find({ deleted: false, ...filter })
    .select(`${FIELDS} department_id`)
    .sort({ created_date: 1 })
    .lean();
  const users = includeUsers ? await usersByOffice(offices.map((o) => o._id)) : {};
  return offices.map((o) => ({
    ...o,
    level: "office",
    ...(includeUsers ? { users_count: (users[String(o._id)] || []).length } : {}),
    children: users[String(o._id)] || [],
  }));
}

// Departments (filter) → [departmentNode → offices]
async function departmentNodes(filter, options = {}) {
  const departments = await DepartmentModel.find({ deleted: false, ...filter })
    .select(`${FIELDS} general_directorate_id`)
    .sort({ created_date: 1 })
    .lean();
  const offices = groupBy(
    await officeNodes({ department_id: { $in: departments.map((d) => d._id) } }, options),
    "department_id",
  );
  return departments.map((d) => ({ ...d, level: "department", children: offices[String(d._id)] || [] }));
}

// General directorates (filter) → [gdNode → departments → offices]
async function generalDirectorateNodes(filter, options = {}) {
  const gds = await GeneralDirectorateModel.find({ deleted: false, ...filter })
    .select(`${FIELDS} unit_id`)
    .sort({ created_date: 1 })
    .lean();
  const departments = groupBy(
    await departmentNodes({ general_directorate_id: { $in: gds.map((g) => g._id) } }, options),
    "general_directorate_id",
  );
  return gds.map((g) => ({ ...g, level: "general_directorate", children: departments[String(g._id)] || [] }));
}

module.exports = { officeNodes, departmentNodes, generalDirectorateNodes, groupBy };
