const STORAGE_KEY = 'clinica-serena-data-v1';
const APPOINTMENT_DURATION_MINUTES = 30;
const DOCTOR_STATUSES = {
  libre: 'Libre',
  activo: 'Activo',
  en_linea: 'En línea',
  offline: 'Offline',
  fuera_de_servicio: 'Fuera de servicio',
};

let database = { doctores: [], pacientes: [], citas: [] };
let toastTimer;

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const normalizeStatus = (status) => Object.hasOwn(DOCTOR_STATUSES, status) ? status : 'libre';

function validateDatabase(data) {
  if (!data || !Array.isArray(data.doctores) || !Array.isArray(data.pacientes) || !Array.isArray(data.citas)) {
    throw new Error('El archivo JSON debe incluir las listas "doctores", "pacientes" y "citas".');
  }
  return {
    doctores: data.doctores.map((doctor) => ({ ...doctor, estado: normalizeStatus(doctor.estado) })),
    hospitales: Array.isArray(data.hospitales) ? data.hospitales : [],
    pacientes: data.pacientes,
    citas: data.citas,
  };
}

async function loadDatabase() {
  const savedData = localStorage.getItem(STORAGE_KEY);
  if (savedData !== null) {
    try {
      database = validateDatabase(JSON.parse(savedData));
      return;
    } catch (error) {
      throw new Error(`No se pudieron leer los datos guardados: ${error.message}`);
    }
  }

  let response;
  try {
    response = await fetch('./data.json');
  } catch (error) {
    throw new Error('No se pudo leer data.json. Abre el proyecto desde un servidor local (por ejemplo, Live Server en VS Code), no directamente como archivo.');
  }
  if (!response.ok) {
    throw new Error(`No se pudo cargar data.json (HTTP ${response.status}).`);
  }

  try {
    database = validateDatabase(await response.json());
  } catch (error) {
    throw new Error(`data.json no es válido: ${error.message}`);
  }
  saveDatabase();
}

function saveDatabase() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
  } catch (error) {
    throw new Error(`No se pudieron guardar los cambios en este navegador: ${error.message}`);
  }
}

function getDoctorHours(doctor) {
  const value = doctor.horario ?? '';
  const match = String(value).match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
  return match ? { start: match[1], end: match[2] } : null;
}

function timeToMinutes(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function isBookableStatus(status) {
  return status === 'libre' || status === 'en_linea';
}

function hasAppointmentConflict(doctorId, date, startTime) {
  const start = timeToMinutes(startTime);
  if (start === null) return true;
  const end = start + APPOINTMENT_DURATION_MINUTES;
  return database.citas.some((appointment) => {
    if (String(appointment.doctorId) !== String(doctorId) || appointment.fecha !== date) return false;
    const appointmentStart = timeToMinutes(appointment.hora);
    if (appointmentStart === null) return true;
    const appointmentEnd = appointmentStart + (Number(appointment.duracionMinutos) || APPOINTMENT_DURATION_MINUTES);
    return start < appointmentEnd && end > appointmentStart;
  });
}

function filterAvailableDoctors(date, startTime) {
  const start = timeToMinutes(startTime);
  if (!date || date < getLocalDateString(new Date()) || start === null) return [];
  const end = start + APPOINTMENT_DURATION_MINUTES;
  return database.doctores.filter((doctor) => {
    if (!isBookableStatus(normalizeStatus(doctor.estado))) return false;
    const hours = getDoctorHours(doctor);
    if (!hours) return false;
    const shiftStart = timeToMinutes(hours.start);
    const shiftEnd = timeToMinutes(hours.end);
    return shiftStart !== null && shiftEnd !== null
      && start >= shiftStart && end <= shiftEnd
      && !hasAppointmentConflict(doctor.id, date, startTime);
  });
}

function showToast(message, isError = false) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3600);
}

function renderError(message) {
  const alert = byId('app-alert');
  alert.textContent = message;
  alert.hidden = false;
}

function makeInitials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || '—';
}

function patientName(patientId) {
  return database.pacientes.find((patient) => String(patient.id) === String(patientId))?.nombre ?? 'Paciente eliminado';
}

function doctorById(doctorId) {
  return database.doctores.find((doctor) => String(doctor.id) === String(doctorId));
}

function formatDate(date) {
  if (!date) return '';
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day));
}

function renderStats() {
  const today = getLocalDateString(new Date());
  byId('stat-patients').textContent = database.pacientes.length;
  byId('stat-appointments').textContent = database.citas.filter((appointment) => appointment.fecha === today).length;
  byId('stat-doctors').textContent = database.doctores.filter((doctor) => isBookableStatus(normalizeStatus(doctor.estado))).length;

  const appointments = [...database.citas].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`))
    .filter((appointment) => appointment.fecha >= today).slice(0, 4);
  byId('overview-appointments').innerHTML = appointments.length
    ? appointments.map((appointment) => {
      const doctor = doctorById(appointment.doctorId);
      return `<div class="preview-row"><div class="preview-time">${escapeHtml(appointment.hora)}</div><div class="preview-info"><strong>${escapeHtml(patientName(appointment.pacienteId))}</strong><small>${escapeHtml(doctor?.nombre ?? 'Doctor eliminado')} · ${escapeHtml(formatDate(appointment.fecha))}</small></div></div>`;
    }).join('')
    : '<div class="empty-state">No hay citas próximas por ahora.</div>';

  const available = database.doctores.filter((doctor) => isBookableStatus(normalizeStatus(doctor.estado))).slice(0, 4);
  byId('overview-doctors').innerHTML = available.length
    ? available.map((doctor) => {
      const hours = getDoctorHours(doctor);
      return `<div class="preview-row"><span class="avatar avatar-teal">${escapeHtml(makeInitials(doctor.nombre))}</span><div class="preview-info"><strong>${escapeHtml(doctor.nombre)}</strong><small>${escapeHtml(doctor.especialidad)} · ${escapeHtml(hours ? `${hours.start} - ${hours.end}` : doctor.horario || 'Horario no definido')}</small></div><span class="status-badge status-${normalizeStatus(doctor.estado)}">${DOCTOR_STATUSES[normalizeStatus(doctor.estado)]}</span></div>`;
    }).join('')
    : '<div class="empty-state">No hay doctores disponibles.</div>';
}

function renderPatients() {
  byId('patient-count').textContent = database.pacientes.length;
  const body = byId('patients-table');
  body.innerHTML = database.pacientes.length
    ? database.pacientes.map((patient) => `<tr>
      <td><div class="patient-cell"><span class="avatar avatar-teal">${escapeHtml(makeInitials(patient.nombre))}</span><span>${escapeHtml(patient.nombre)}</span></div></td>
      <td>${escapeHtml(patient.documento)}</td><td>${escapeHtml(patient.telefono)}</td>
      <td><div class="row-actions"><button class="action-button" type="button" data-edit-patient="${escapeHtml(patient.id)}">Editar</button><button class="action-button delete" type="button" data-delete-patient="${escapeHtml(patient.id)}">Eliminar</button></div></td>
    </tr>`).join('')
    : '<tr><td class="empty-row" colspan="4">Aún no hay pacientes registrados.</td></tr>';
  renderPatientOptions();
}

function renderHospitals() {
  byId('hospital-count').textContent = database.hospitales.length;
  byId('hospitals-table').innerHTML = database.hospitales.length
    ? database.hospitales.map((hospital) => `<tr>
      <td><div class="patient-cell"><span class="avatar avatar-teal">${escapeHtml(makeInitials(hospital.nombre))}</span><span>${escapeHtml(hospital.nombre)}<br><span class="optional">${escapeHtml(hospital.tipo)}</span></span></div></td>
      <td>${escapeHtml(hospital.direccion)}</td>
      <td>${escapeHtml(hospital.telefono)}${hospital.correo ? `<br><span class="optional">${escapeHtml(hospital.correo)}</span>` : ''}</td>
      <td><div class="row-actions"><button class="action-button" type="button" data-edit-hospital="${escapeHtml(hospital.id)}">Editar</button><button class="action-button delete" type="button" data-delete-hospital="${escapeHtml(hospital.id)}">Eliminar</button></div></td>
    </tr>`).join('')
    : '<tr><td class="empty-row" colspan="4">Aún no hay clínicas u hospitales registrados.</td></tr>';
}

function renderPatientOptions() {
  const select = byId('appointment-patient');
  const selected = select.value;
  select.innerHTML = '<option value="">Selecciona un paciente</option>' + database.pacientes
    .map((patient) => `<option value="${escapeHtml(patient.id)}">${escapeHtml(patient.nombre)}</option>`).join('');
  if (database.pacientes.some((patient) => String(patient.id) === selected)) select.value = selected;
}

function renderDoctors() {
  const filter = byId('doctor-filter').value;
  const doctors = database.doctores.filter((doctor) => filter === 'todos' || isBookableStatus(normalizeStatus(doctor.estado)));
  byId('doctors-list').innerHTML = doctors.length
    ? doctors.map((doctor) => {
      const status = normalizeStatus(doctor.estado);
      const hours = getDoctorHours(doctor);
      const hoursLabel = hours ? `${hours.start} - ${hours.end}` : doctor.horario || 'Horario no definido';
      return `<article class="doctor-card">
        <div class="doctor-card-top"><span class="avatar avatar-teal">${escapeHtml(makeInitials(doctor.nombre))}</span><span class="status-badge status-${status}">${DOCTOR_STATUSES[status]}</span></div>
        <h4>${escapeHtml(doctor.nombre)}</h4><p class="doctor-specialty">${escapeHtml(doctor.especialidad)}</p>
        <div class="doctor-hours"><span aria-hidden="true">◷</span> Atención: ${escapeHtml(hoursLabel)}</div>
        <div class="row-actions"><button class="action-button" type="button" data-edit-doctor="${escapeHtml(doctor.id)}">Editar</button><button class="action-button delete" type="button" data-delete-doctor="${escapeHtml(doctor.id)}">Eliminar</button></div>
      </article>`;
    }).join('')
    : '<div class="empty-state">No hay doctores que coincidan con este filtro.</div>';
}

function renderAppointments() {
  const appointments = [...database.citas].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
  byId('appointment-count').textContent = appointments.length;
  byId('appointments-table').innerHTML = appointments.length
    ? appointments.map((appointment) => {
      const doctor = doctorById(appointment.doctorId);
      return `<tr><td>${escapeHtml(formatDate(appointment.fecha))}<br><span class="optional">${escapeHtml(appointment.hora)} · 30 min</span></td>
        <td>${escapeHtml(patientName(appointment.pacienteId))}</td><td>${escapeHtml(doctor?.nombre ?? 'Doctor eliminado')}</td>
        <td><button class="action-button delete" type="button" data-delete-appointment="${escapeHtml(appointment.id)}">Cancelar</button></td></tr>`;
    }).join('')
    : '<tr><td class="empty-row" colspan="4">No hay citas programadas.</td></tr>';
}

function renderAll() {
  renderStats();
  renderPatients();
  renderHospitals();
  renderDoctors();
  renderAppointments();
  updateAvailableDoctorOptions();
}

function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function updateAvailableDoctorOptions() {
  const doctorSelect = byId('appointment-doctor');
  const { value: previousValue } = doctorSelect;
  const date = byId('appointment-date').value;
  const time = byId('appointment-time').value;
  const available = filterAvailableDoctors(date, time);
  doctorSelect.innerHTML = available.length
    ? '<option value="">Selecciona un doctor</option>' + available.map((doctor) => `<option value="${escapeHtml(doctor.id)}">${escapeHtml(doctor.nombre)} · ${escapeHtml(doctor.especialidad)} · ${escapeHtml(normalizeStatus(doctor.estado) === 'en_linea' ? 'Virtual' : 'Presencial')}</option>`).join('')
    : '<option value="">No hay doctores disponibles en ese horario</option>';
  if (available.some((doctor) => String(doctor.id) === previousValue)) doctorSelect.value = previousValue;
}

function switchView(viewName) {
  document.querySelectorAll('.view').forEach((view) => {
    const visible = view.id === `view-${viewName}`;
    view.classList.toggle('is-visible', visible);
    view.hidden = !visible;
  });
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('is-active', link.dataset.view === viewName));
  const titles = { inicio: 'Buenos días', pacientes: 'Pacientes', doctores: 'Doctores', hospitales: 'Clínicas y hospitales', citas: 'Agenda de citas' };
  byId('page-title').innerHTML = `${titles[viewName]}${viewName === 'inicio' ? ' <span aria-hidden="true">☀</span>' : ''}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetPatientForm() {
  byId('patient-form').reset();
  byId('patient-id').value = '';
  byId('patient-form-title').textContent = 'Nuevo paciente';
  byId('patient-submit').textContent = 'Guardar paciente';
  byId('patient-cancel').hidden = true;
}

function resetDoctorForm() {
  byId('doctor-form').reset();
  byId('doctor-id').value = '';
  byId('doctor-start').value = '08:00';
  byId('doctor-end').value = '16:00';
  byId('doctor-status').value = 'libre';
  byId('doctor-form-title').textContent = 'Registrar doctor';
  byId('doctor-submit').textContent = 'Guardar doctor';
  byId('doctor-cancel').hidden = true;
}

function resetHospitalForm() {
  byId('hospital-form').reset();
  byId('hospital-id').value = '';
  byId('hospital-form-title').textContent = 'Agregar clínica u hospital';
  byId('hospital-submit').textContent = 'Agregar centro';
  byId('hospital-cancel').hidden = true;
}

function nextId(records) {
  return records.reduce((highest, record) => Math.max(highest, Number(record.id) || 0), 0) + 1;
}

function saveWithFeedback(successMessage, render) {
  try {
    saveDatabase();
    render();
    showToast(successMessage);
  } catch (error) {
    showToast(error.message, true);
  }
}

function onPatientSubmit(event) {
  event.preventDefault();
  const id = byId('patient-id').value;
  const patient = {
    id: id || nextId(database.pacientes),
    nombre: byId('patient-name').value.trim(),
    documento: byId('patient-document').value.trim(),
    fechaNacimiento: byId('patient-birthdate').value,
    telefono: byId('patient-phone').value.trim(),
    correo: byId('patient-email').value.trim(),
  };
  const duplicate = database.pacientes.some((item) => String(item.documento ?? '').toLowerCase() === patient.documento.toLowerCase() && String(item.id) !== String(id));
  if (duplicate) {
    showToast('Ya existe un paciente con ese documento de identidad.', true);
    return;
  }
  if (id) database.pacientes = database.pacientes.map((item) => String(item.id) === String(id) ? patient : item);
  else database.pacientes.push(patient);
  resetPatientForm();
  saveWithFeedback(id ? 'Datos del paciente actualizados.' : 'Paciente registrado correctamente.', renderAll);
}

function onDoctorSubmit(event) {
  event.preventDefault();
  const id = byId('doctor-id').value;
  const start = byId('doctor-start').value;
  const end = byId('doctor-end').value;
  if (timeToMinutes(start) === null || timeToMinutes(end) === null || timeToMinutes(start) >= timeToMinutes(end)) {
    showToast('El horario de fin debe ser posterior al horario de inicio.', true);
    return;
  }
  const doctor = {
    id: id || nextId(database.doctores),
    nombre: byId('doctor-name').value.trim(),
    especialidad: byId('doctor-specialty').value.trim(),
    horario: `${start} - ${end}`,
    estado: byId('doctor-status').value,
  };
  if (id) database.doctores = database.doctores.map((item) => String(item.id) === String(id) ? doctor : item);
  else database.doctores.push(doctor);
  resetDoctorForm();
  saveWithFeedback(id ? 'Datos del doctor actualizados.' : 'Doctor registrado correctamente.', renderAll);
}

function onHospitalSubmit(event) {
  event.preventDefault();
  const id = byId('hospital-id').value;
  const hospital = {
    id: id || nextId(database.hospitales),
    nombre: byId('hospital-name').value.trim(),
    tipo: byId('hospital-type').value,
    direccion: byId('hospital-address').value.trim(),
    telefono: byId('hospital-phone').value.trim(),
    correo: byId('hospital-email').value.trim(),
  };
  const duplicate = database.hospitales.some((item) => item.nombre.toLowerCase() === hospital.nombre.toLowerCase()
    && item.direccion.toLowerCase() === hospital.direccion.toLowerCase()
    && String(item.id) !== String(id));
  if (duplicate) {
    showToast('Ya existe un centro con ese nombre y dirección.', true);
    return;
  }
  if (id) database.hospitales = database.hospitales.map((item) => String(item.id) === String(id) ? hospital : item);
  else database.hospitales.push(hospital);
  resetHospitalForm();
  saveWithFeedback(id ? 'Datos del centro actualizados.' : 'Clínica u hospital agregado correctamente.', renderAll);
}

function onAppointmentSubmit(event) {
  event.preventDefault();
  const patientId = byId('appointment-patient').value;
  const date = byId('appointment-date').value;
  const time = byId('appointment-time').value;
  const doctorId = byId('appointment-doctor').value;
  const doctor = doctorById(doctorId);
  if (!database.pacientes.some((patient) => String(patient.id) === patientId)) {
    showToast('Registra o selecciona un paciente válido antes de agendar.', true);
    return;
  }
  if (!doctor || !filterAvailableDoctors(date, time).some((item) => String(item.id) === String(doctorId))) {
    updateAvailableDoctorOptions();
    showToast('El doctor ya no está disponible en ese horario. Selecciona otro segmento.', true);
    return;
  }
  const appointment = {
    id: nextId(database.citas),
    pacienteId: patientId,
    doctorId,
    fecha: date,
    hora: time,
    duracionMinutos: APPOINTMENT_DURATION_MINUTES,
    motivo: byId('appointment-reason').value.trim(),
  };
  database.citas.push(appointment);
  saveWithFeedback('Cita confirmada. El horario quedó reservado.', renderAll);
  byId('appointment-form').reset();
  byId('appointment-date').value = date;
  updateAvailableDoctorOptions();
}

function editPatient(id) {
  const patient = database.pacientes.find((item) => String(item.id) === String(id));
  if (!patient) return;
  byId('patient-id').value = patient.id;
  byId('patient-name').value = patient.nombre ?? '';
  byId('patient-document').value = patient.documento ?? '';
  byId('patient-birthdate').value = patient.fechaNacimiento ?? '';
  byId('patient-phone').value = patient.telefono ?? '';
  byId('patient-email').value = patient.correo ?? '';
  byId('patient-form-title').textContent = 'Actualizar paciente';
  byId('patient-submit').textContent = 'Guardar cambios';
  byId('patient-cancel').hidden = false;
  byId('patient-name').focus();
}

function editDoctor(id) {
  const doctor = doctorById(id);
  if (!doctor) return;
  const hours = getDoctorHours(doctor);
  byId('doctor-id').value = doctor.id;
  byId('doctor-name').value = doctor.nombre ?? '';
  byId('doctor-specialty').value = doctor.especialidad ?? '';
  byId('doctor-start').value = hours?.start ?? '08:00';
  byId('doctor-end').value = hours?.end ?? '16:00';
  byId('doctor-status').value = normalizeStatus(doctor.estado);
  byId('doctor-form-title').textContent = 'Actualizar doctor';
  byId('doctor-submit').textContent = 'Guardar cambios';
  byId('doctor-cancel').hidden = false;
  byId('doctor-name').focus();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function editHospital(id) {
  const hospital = database.hospitales.find((item) => String(item.id) === String(id));
  if (!hospital) return;
  byId('hospital-id').value = hospital.id;
  byId('hospital-name').value = hospital.nombre ?? '';
  byId('hospital-type').value = hospital.tipo ?? 'Clínica';
  byId('hospital-address').value = hospital.direccion ?? '';
  byId('hospital-phone').value = hospital.telefono ?? '';
  byId('hospital-email').value = hospital.correo ?? '';
  byId('hospital-form-title').textContent = 'Actualizar centro';
  byId('hospital-submit').textContent = 'Guardar cambios';
  byId('hospital-cancel').hidden = false;
  byId('hospital-name').focus();
}

function handleClick(event) {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.view) switchView(target.dataset.view);
  if (target.dataset.openView) switchView(target.dataset.openView);
  if (target.dataset.focusForm) {
    const viewName = target.dataset.focusForm.startsWith('patient') ? 'pacientes'
      : target.dataset.focusForm.startsWith('doctor') ? 'doctores' : 'hospitales';
    switchView(viewName);
    byId(target.dataset.focusForm).focus();
    document.getElementById(`view-${viewName}`).scrollIntoView({ behavior: 'smooth' });
  }
  if (target.dataset.editPatient) editPatient(target.dataset.editPatient);
  if (target.dataset.editDoctor) editDoctor(target.dataset.editDoctor);
  if (target.dataset.editHospital) editHospital(target.dataset.editHospital);
  if (target.dataset.deletePatient) {
    const patient = database.pacientes.find((item) => String(item.id) === target.dataset.deletePatient);
    if (!patient || !window.confirm(`¿Eliminar a ${patient.nombre}? Sus citas existentes se conservarán.`)) return;
    database.pacientes = database.pacientes.filter((item) => String(item.id) !== target.dataset.deletePatient);
    saveWithFeedback('Paciente eliminado.', renderAll);
  }
  if (target.dataset.deleteDoctor) {
    const doctor = doctorById(target.dataset.deleteDoctor);
    if (!doctor || !window.confirm(`¿Eliminar a ${doctor.nombre}? Sus citas existentes se conservarán.`)) return;
    database.doctores = database.doctores.filter((item) => String(item.id) !== target.dataset.deleteDoctor);
    saveWithFeedback('Doctor eliminado.', renderAll);
  }
  if (target.dataset.deleteHospital) {
    const hospital = database.hospitales.find((item) => String(item.id) === target.dataset.deleteHospital);
    if (!hospital || !window.confirm(`¿Eliminar ${hospital.nombre} del directorio?`)) return;
    database.hospitales = database.hospitales.filter((item) => String(item.id) !== target.dataset.deleteHospital);
    saveWithFeedback('Centro eliminado.', renderAll);
  }
  if (target.dataset.deleteAppointment) {
    if (!window.confirm('¿Cancelar esta cita?')) return;
    database.citas = database.citas.filter((item) => String(item.id) !== target.dataset.deleteAppointment);
    saveWithFeedback('Cita cancelada.', renderAll);
  }
}

function initialize() {
  byId('today-label').textContent = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const today = getLocalDateString(new Date());
  byId('appointment-date').min = today;
  byId('appointment-date').value = today;

  document.addEventListener('click', handleClick);
  byId('patient-form').addEventListener('submit', onPatientSubmit);
  byId('doctor-form').addEventListener('submit', onDoctorSubmit);
  byId('hospital-form').addEventListener('submit', onHospitalSubmit);
  byId('appointment-form').addEventListener('submit', onAppointmentSubmit);
  byId('patient-cancel').addEventListener('click', resetPatientForm);
  byId('doctor-cancel').addEventListener('click', resetDoctorForm);
  byId('hospital-cancel').addEventListener('click', resetHospitalForm);
  byId('doctor-filter').addEventListener('change', renderDoctors);
  byId('appointment-date').addEventListener('change', updateAvailableDoctorOptions);
  byId('appointment-time').addEventListener('input', updateAvailableDoctorOptions);

  loadDatabase().then(renderAll).catch((error) => renderError(error.message));
}

initialize();