/**
 * Shared helper utilities for Mumaa API
 */

// ─── Password Hashing ───────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Vaccination Seeder ──────────────────────────────────────────────────────

export async function seedVaccinations(db: D1Database, babyId: string, dob: string) {
  const birthDate = new Date(dob);
  const schedule = [
    { name: 'BCG',                due: 0,   desc: 'Tuberculosis' },
    { name: 'Hepatitis B - 1',    due: 0,   desc: 'Hepatitis B' },
    { name: 'OPV - 0',            due: 0,   desc: 'Polio' },
    { name: 'OPV - 1',            due: 42,  desc: 'Polio' },
    { name: 'Pentavalent - 1',    due: 42,  desc: 'DTP, Hep B, Hib' },
    { name: 'Rotavirus - 1',      due: 42,  desc: 'Rotavirus' },
    { name: 'PCV - 1',            due: 42,  desc: 'Pneumococcal' },
    { name: 'OPV - 2',            due: 70,  desc: 'Polio' },
    { name: 'Pentavalent - 2',    due: 70,  desc: 'DTP, Hep B, Hib' },
    { name: 'Rotavirus - 2',      due: 70,  desc: 'Rotavirus' },
    { name: 'PCV - 2',            due: 70,  desc: 'Pneumococcal' },
    { name: 'OPV - 3',            due: 98,  desc: 'Polio' },
    { name: 'Pentavalent - 3',    due: 98,  desc: 'DTP, Hep B, Hib' },
    { name: 'Rotavirus - 3',      due: 98,  desc: 'Rotavirus' },
    { name: 'PCV - 3',            due: 98,  desc: 'Pneumococcal' },
    { name: 'OPV - 4',            due: 180, desc: 'Polio' },
    { name: 'Hepatitis B - 2',    due: 180, desc: 'Hepatitis B' },
    { name: 'Vitamin A - 1',      due: 270, desc: 'Vitamin A' },
    { name: 'MR - 1',             due: 270, desc: 'Measles, Rubella' },
    { name: 'PCV Booster',        due: 270, desc: 'Pneumococcal' },
    { name: 'Vitamin A - 2',      due: 365, desc: 'Vitamin A' },
    { name: 'MR - 2',             due: 450, desc: 'Measles, Rubella' },
    { name: 'DPT Booster - 1',    due: 540, desc: 'Diphtheria, Pertussis, Tetanus' },
    { name: 'OPV - 5',            due: 540, desc: 'Polio' },
  ];

  for (const v of schedule) {
    const dueDate = new Date(birthDate);
    dueDate.setDate(dueDate.getDate() + v.due);
    await db.prepare(
      'INSERT INTO vaccinations (id, baby_id, vaccine_name, due_date, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), babyId, v.name, dueDate.toISOString().split('T')[0], 'pending').run();
  }
}

// ─── Milestone Seeder ────────────────────────────────────────────────────────

export async function seedMilestones(db: D1Database, babyId: string) {
  const milestones = [
    { name: 'First Social Smile', age: '0-3 months', badge: '😊', desc: 'Baby smiles in response to your smile' },
    { name: 'Follows Objects',    age: '0-3 months', badge: '👀', desc: 'Tracks moving objects with eyes' },
    { name: 'Coos and Gurgles',   age: '0-3 months', badge: '🗣️', desc: 'Makes cooing sounds' },
    { name: 'Holds Head Up',      age: '0-3 months', badge: '💪', desc: 'Can hold head up briefly during tummy time' },
    { name: 'Rolls Over',         age: '3-6 months', badge: '🔄', desc: 'Rolls from tummy to back or vice versa' },
    { name: 'Sits with Support',  age: '3-6 months', badge: '🪑', desc: 'Can sit when propped up' },
    { name: 'Babbling',           age: '6-9 months', badge: '💬', desc: 'Makes repetitive consonant sounds' },
    { name: 'Crawling',           age: '9-12 months', badge: '🚶', desc: 'Moves around on hands and knees' },
  ];

  for (const m of milestones) {
    await db.prepare(
      'INSERT INTO milestones (id, baby_id, milestone_name, age_range, badge, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))'
    ).bind(crypto.randomUUID(), babyId, m.name, m.age, m.badge, m.desc, 'pending').run();
  }
}
