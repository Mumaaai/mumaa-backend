import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
}

const ops = new Hono<{ Bindings: Bindings }>()

// Helper for hashing passwords
async function hashPassword(password: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Middleware to verify Admin role
const adminMiddleware = async (c: any, next: any) => {
  const staffId = c.req.header('X-Staff-ID')
  if (!staffId) return c.json({ error: 'Unauthorized: No Staff ID' }, 401)

  try {
    const employee = await c.env.DB.prepare('SELECT role FROM employees WHERE id = ?').bind(staffId).first()
    if (!employee || employee.role !== 'Admin') {
      return c.json({ error: 'Forbidden: Admin access required' }, 403)
    }
    await next()
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
}

// Apply admin middleware to all admin routes
ops.use('/admin/*', adminMiddleware)

// Base route for ops
ops.get('/', (c) => {
  return c.json({ message: 'OpsBoard API is operational' })
})

/**
 * Ops Authentication
 */
ops.post('/auth/signup', async (c) => {
  const { email, password, fullName } = await c.req.json()
  
  try {
    const existingEmployee = await c.env.DB.prepare('SELECT id FROM employees WHERE email = ?').bind(email).first()
    if (existingEmployee) return c.json({ error: 'Staff email already registered' }, 400)

    const id = crypto.randomUUID()
    const hashedPassword = await hashPassword(password)

    // Create employee record (Independent of users table)
    await c.env.DB.prepare(`
      INSERT INTO employees (id, email, hashed_password, full_name, status) 
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, email, hashedPassword, fullName, 'Pending').run()

    return c.json({ message: 'Staff account created and pending approval', status: 'Pending' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json()
  
  try {
    const hashedPassword = await hashPassword(password)
    const employee = await c.env.DB.prepare('SELECT * FROM employees WHERE email = ? AND hashed_password = ?')
      .bind(email, hashedPassword)
      .first()

    if (!employee) return c.json({ error: 'Invalid staff credentials' }, 401)

    if (employee.status === 'Pending') return c.json({ error: 'Staff account pending approval' }, 403)
    if (employee.status === 'Rejected') return c.json({ error: 'Staff access denied' }, 403)

    return c.json({
      message: 'Staff login successful',
      user: { id: employee.id, email: employee.email, name: employee.full_name, role: employee.role, onboarded: employee.onboarded }
    })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * Task Management
 */
ops.get('/tasks', async (c) => {
  try {
    const tasks = await c.env.DB.prepare('SELECT * FROM ops_tasks ORDER BY created_at DESC').all()
    return c.json(tasks.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.get('/tasks/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const task = await c.env.DB.prepare('SELECT * FROM ops_tasks WHERE id = ?').bind(id).first()
    if (!task) return c.json({ error: 'Task not found' }, 404)
    return c.json(task)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.post('/tasks', async (c) => {
  const body = await c.req.json()
  const id = crypto.randomUUID()
  
  try {
    // Convert empty strings to null for optional FKs
    const assigned_to = body.assigned_to || null;
    const assigned_by = body.assigned_by || null;
    const team_id = body.team_id || null;
    const project_id = body.project_id || null;

    // Allow storing tags and drive_links and other optional metadata
    const tags = body.tags || null;
    const drive_links = body.drive_links || null;
    const start_date = body.start_date || null;
    const progress = body.progress !== undefined ? body.progress : 0;
    const estimated_hours = body.estimated_hours || null;
    const actual_hours = body.actual_hours || null;

    const assignees = body.assignees || null;

    await c.env.DB.prepare(`
      INSERT INTO ops_tasks (
        id, title, description, assigned_to, assignees, assigned_by, team_id, project_id,
        status, priority, deadline, start_date, progress, estimated_hours, actual_hours, tags, drive_links
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, body.title, body.description, assigned_to, assignees, assigned_by,
      team_id, project_id, body.status || 'Draft', body.priority || 'Medium',
      body.deadline || null, start_date, progress, estimated_hours, actual_hours, tags, drive_links
    ).run()
    
    // Log Activity (Only if we have a valid assigned_by ID)
    if (assigned_by) {
      const logId = crypto.randomUUID()
      await c.env.DB.prepare(`
        INSERT INTO ops_activity_logs (id, task_id, user_id, action, details)
        VALUES (?, ?, ?, ?, ?)
      `).bind(logId, id, assigned_by, 'Task Created', `Task "${body.title}" was created.`).run()
    }

    // Create Notifications
    const targetUsers = [];
    if (assigned_to) targetUsers.push(assigned_to);
    if (assignees) {
      const list = assignees.split(',').filter(Boolean);
      list.forEach(uId => {
        if (!targetUsers.includes(uId)) targetUsers.push(uId);
      });
    }

    for (const uId of targetUsers) {
      if (uId !== assigned_by) { // Don't notify the creator
        const notifId = crypto.randomUUID()
        await c.env.DB.prepare(`
          INSERT INTO ops_notifications (id, user_id, title, description, type)
          VALUES (?, ?, ?, ?, ?)
        `).bind(notifId, uId, 'New Task Assigned', `You have been assigned to task "${body.title}".`, 'Task').run()
      }
    }

    return c.json({ id, status: 'created' })
  } catch (err: any) {
    console.error('Task Creation Error:', err)
    return c.json({ error: 'Database error', message: err.message }, 500)
  }
})

ops.put('/tasks/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  
  try {
    const sets = []
    const values = []
    
    const fields = [
      'title', 'description', 'assigned_to', 'assignees', 'status', 'priority',
      'progress', 'deadline', 'actual_hours', 'remarks', 'tags', 'drive_links', 'start_date', 'estimated_hours'
    ]
    
    for (const field of fields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = ?`)
        // Convert empty string to null for FK fields or dates
        const value = (body[field] === '' && ['assigned_to', 'deadline'].includes(field)) ? null : body[field];
        values.push(value)
      }
    }
    
    if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400)
    
    sets.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)
    
    await c.env.DB.prepare(`
      UPDATE ops_tasks SET ${sets.join(', ')} WHERE id = ?
    `).bind(...values).run()
    
    // Log Activity if status changed and we have a valid updater
    const updaterId = body.updated_by || null;
    if (body.status && updaterId && updaterId !== 'system') {
      const logId = crypto.randomUUID()
      await c.env.DB.prepare(`
        INSERT INTO ops_activity_logs (id, task_id, user_id, action, details)
        VALUES (?, ?, ?, ?, ?)
      `).bind(logId, id, updaterId, 'Status Changed', `Status updated to ${body.status}`).run()

      // Notify Assignees
      const task = await c.env.DB.prepare('SELECT title, assigned_to, assignees FROM ops_tasks WHERE id = ?').bind(id).first();
      
      const targetUsers = [];
      if (task.assigned_to) targetUsers.push(task.assigned_to);
      if (task.assignees) {
        const list = task.assignees.split(',').filter(Boolean);
        list.forEach(uId => {
          if (!targetUsers.includes(uId)) targetUsers.push(uId);
        });
      }

      for (const uId of targetUsers) {
        if (uId !== updaterId) { // Don't notify the updater
          const notifId = crypto.randomUUID()
          await c.env.DB.prepare(`
            INSERT INTO ops_notifications (id, user_id, title, description, type)
            VALUES (?, ?, ?, ?, ?)
          `).bind(notifId, uId, 'Task Status Updated', `Task "${task.title}" status updated to ${body.status}.`, 'Task').run()
        }
      }
    }

    return c.json({ status: 'updated' })
  } catch (err: any) {
    console.error('Task Update Error:', err)
    return c.json({ error: 'Database error', message: err.message }, 500)
  }
})

ops.delete('/tasks/:id', async (c) => {
  const id = c.req.param('id')
  try {
    await c.env.DB.prepare('DELETE FROM ops_tasks WHERE id = ?').bind(id).run()
    return c.json({ status: 'deleted' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * Notifications
 */
ops.get('/notifications', async (c) => {
  const userId = c.req.header('X-Staff-ID')
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const notifications = await c.env.DB.prepare('SELECT * FROM ops_notifications WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all()
    return c.json(notifications.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.put('/notifications/:id/read', async (c) => {
  const id = c.req.param('id')
  try {
    await c.env.DB.prepare('UPDATE ops_notifications SET is_read = 1 WHERE id = ?').bind(id).run()
    return c.json({ status: 'updated' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * Task Comments
 */
ops.get('/tasks/:id/comments', async (c) => {
  const taskId = c.req.param('id')
  try {
    const comments = await c.env.DB.prepare(`
      SELECT c.*, e.full_name as user_name 
      FROM ops_task_comments c
      JOIN employees e ON c.user_id = e.id
      WHERE c.task_id = ? 
      ORDER BY c.created_at ASC
    `).bind(taskId).all()
    return c.json(comments.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.post('/tasks/:id/comments', async (c) => {
  const taskId = c.req.param('id')
  const body = await c.req.json()
  const id = crypto.randomUUID()
  
  try {
    await c.env.DB.prepare(`
      INSERT INTO ops_task_comments (id, task_id, user_id, content)
      VALUES (?, ?, ?, ?)
    `).bind(id, taskId, body.user_id, body.content).run()
    
    // Notify Assignees and Creator
    const task = await c.env.DB.prepare('SELECT title, assigned_to, assignees, assigned_by FROM ops_tasks WHERE id = ?').bind(taskId).first();
    
    const targetUsers = [];
    if (task.assigned_to) targetUsers.push(task.assigned_to);
    if (task.assignees) {
      const list = task.assignees.split(',').filter(Boolean);
      list.forEach(uId => {
        if (!targetUsers.includes(uId)) targetUsers.push(uId);
      });
    }
    if (task.assigned_by && !targetUsers.includes(task.assigned_by)) {
      targetUsers.push(task.assigned_by);
    }

    for (const uId of targetUsers) {
      if (uId !== body.user_id) { // Don't notify the commenter
        const notifId = crypto.randomUUID()
        await c.env.DB.prepare(`
          INSERT INTO ops_notifications (id, user_id, title, description, type)
          VALUES (?, ?, ?, ?, ?)
        `).bind(notifId, uId, 'New Comment on Task', `New comment on task "${task.title}".`, 'Comment').run()
      }
    }

    return c.json({ id, status: 'added' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * Projects
 */
ops.get('/projects', async (c) => {
  try {
    const projects = await c.env.DB.prepare(`
      SELECT p.*, e.full_name as owner_name 
      FROM ops_projects p
      LEFT JOIN employees e ON p.owner_id = e.id
      ORDER BY p.created_at DESC
    `).all()
    return c.json(projects.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.post('/projects', async (c) => {
  const body = await c.req.json()
  const id = crypto.randomUUID()
  try {
    await c.env.DB.prepare(`
      INSERT INTO ops_projects (id, name, description, owner_id, status, start_date, deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, 
      body.name, 
      body.description, 
      body.owner_id || null, 
      body.status || 'Active', 
      body.start_date || null, 
      body.deadline || null
    ).run()
    return c.json({ id, status: 'created' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.put('/projects/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  
  try {
    const sets = []
    const values = []
    
    const fields = [
      'name', 'description', 'owner_id', 'status', 'start_date', 'deadline'
    ]
    
    for (const field of fields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = ?`)
        const value = (body[field] === '' && ['owner_id', 'start_date', 'deadline'].includes(field)) ? null : body[field];
        values.push(value)
      }
    }
    
    if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400)
    
    sets.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)
    
    await c.env.DB.prepare(`
      UPDATE ops_projects SET ${sets.join(', ')} WHERE id = ?
    `).bind(...values).run()
    
    return c.json({ status: 'updated' })
  } catch (err: any) {
    console.error('Project Update Error:', err)
    return c.json({ error: 'Database error', message: err.message }, 500)
  }
})

/**
 * Teams
 */
ops.get('/teams', async (c) => {
  try {
    const teams = await c.env.DB.prepare(`
      SELECT t.*, e.full_name as lead_name 
      FROM ops_teams t
      LEFT JOIN employees e ON t.lead_id = e.id
      ORDER BY t.name ASC
    `).all()
    return c.json(teams.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.post('/teams', async (c) => {
  const body = await c.req.json()
  const id = crypto.randomUUID()
  try {
    await c.env.DB.prepare(`
      INSERT INTO ops_teams (id, name, purpose, lead_id, members)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, body.name, body.purpose, body.lead_id, body.members || null).run()
    return c.json({ id, status: 'created' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * Employee Profile & Onboarding
 */
ops.get('/employee/profile/:userId', async (c) => {
  const userId = c.req.param('userId')
  try {
    const employee = await c.env.DB.prepare(`
      SELECT * FROM employees WHERE id = ?
    `).bind(userId).first()
    
    if (!employee) return c.json({ error: 'Employee not found' }, 404)
    return c.json(employee)
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.put('/employee/profile/:userId', async (c) => {
  const userId = c.req.param('userId')
  const body = await c.req.json()
  
  try {
    const sets = []
    const values = []
    
    // Only allow updating editable fields
    const allowedFields = ['full_name', 'phone_number', 'date_of_birth', 'address', 'emergency_contact', 'profile_picture']
    
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = ?`)
        values.push(body[field])
      }
    }
    
    if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400)
    
    sets.push('updated_at = CURRENT_TIMESTAMP')
    values.push(userId)
    
    await c.env.DB.prepare(`
      UPDATE employees SET ${sets.join(', ')} WHERE id = ?
    `).bind(...values).run()
    
    return c.json({ status: 'updated' })
  } catch (err: any) {
    console.error('Profile Update Error:', err)
    return c.json({ error: 'Database error', message: err.message }, 500)
  }
})

ops.post('/employee/onboard', async (c) => {
  const body = await c.req.json()
  const { 
    user_id, 
    designation, 
    department, 
    role,
    employee_id,
    phone_number,
    date_of_birth,
    address,
    emergency_contact
  } = body
  
  try {
    await c.env.DB.prepare(`
      UPDATE employees 
      SET designation = ?, department = ?, role = ?, employee_id = ?, 
          phone_number = ?, date_of_birth = ?, address = ?, 
          emergency_contact = ?, onboarded = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      designation, department, role, employee_id, 
      phone_number, date_of_birth, address, 
      emergency_contact, user_id
    ).run()
    
    return c.json({ status: 'onboarded' })
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * Admin: Employee Management
 */
ops.get('/admin/employees', async (c) => {
  try {
    const staff = await c.env.DB.prepare(`
      SELECT 
        id, full_name, email, role, designation, department, 
        status, onboarded, joining_date, joined_at,
        phone_number, employee_id, address
      FROM employees
      ORDER BY joined_at DESC
    `).all()
    return c.json(staff.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.put('/admin/employee/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  
  try {
    const fields = [
      'role', 'status', 'designation', 'department', 
      'full_name', 'phone_number', 'employee_id', 
      'address', 'joining_date'
    ]
    const sets = []
    const values = []
    
    for (const field of fields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = ?`)
        values.push(body[field])
      }
    }
    
    if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400)
    
    sets.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)
    
    await c.env.DB.prepare(`
      UPDATE employees SET ${sets.join(', ')} WHERE id = ?
    `).bind(...values).run()
    
    return c.json({ status: 'updated' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.post('/admin/teams', async (c) => {
  const { name, purpose, lead_id, members } = await c.req.json()
  const id = crypto.randomUUID()
  try {
    await c.env.DB.prepare(`
      INSERT INTO ops_teams (id, name, purpose, lead_id, members)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, name, purpose, lead_id || null, members || null).run()
    return c.json({ id, status: 'created' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.post('/admin/projects', async (c) => {
  const { name, description, owner_id, deadline } = await c.req.json()
  const id = crypto.randomUUID()
  try {
    await c.env.DB.prepare(`
      INSERT INTO ops_projects (id, name, description, owner_id, deadline)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, name, description, owner_id || null, deadline || null).run()
    return c.json({ id, status: 'created' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.put('/admin/teams/:id', async (c) => {
  const id = c.req.param('id')
  const updates = await c.req.json()
  const sets = []
  const values = []
  
  const allowedFields = ['name', 'purpose', 'lead_id', 'members']
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      sets.push(`${field} = ?`)
      values.push(updates[field])
    }
  }
  
  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400)
  
  sets.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)

  try {
    await c.env.DB.prepare(`
      UPDATE ops_teams SET ${sets.join(', ')} WHERE id = ?
    `).bind(...values).run()
    return c.json({ status: 'updated' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.put('/admin/projects/:id', async (c) => {
  const id = c.req.param('id')
  const updates = await c.req.json()
  const sets = []
  const values = []
  
  const allowedFields = ['name', 'description', 'owner_id', 'deadline', 'status']
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      sets.push(`${field} = ?`)
      values.push(updates[field])
    }
  }
  
  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400)
  
  sets.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)

  try {
    await c.env.DB.prepare(`
      UPDATE ops_projects SET ${sets.join(', ')} WHERE id = ?
    `).bind(...values).run()
    return c.json({ status: 'updated' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.get('/users', async (c) => {
  try {
    const staff = await c.env.DB.prepare(`
      SELECT id, full_name, email, role, designation, status, onboarded
      FROM employees
      WHERE status = 'Approved' OR status = 'Active'
    `).all()
    return c.json(staff.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.get('/events', async (c) => {
  try {
    const events = await c.env.DB.prepare('SELECT * FROM ops_events ORDER BY start_time ASC').all()
    return c.json(events.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.post('/events', async (c) => {
  const { title, description, event_type, start_time, end_time, location, attendees, created_by } = await c.req.json()
  const id = crypto.randomUUID()
  try {
    await c.env.DB.prepare(`
      INSERT INTO ops_events (id, title, description, event_type, start_time, end_time, location, attendees, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, title, description || null, event_type || 'Event', start_time, end_time, location || null, attendees || null, created_by).run()
    // Create Notifications for Attendees
    if (attendees) {
      const list = attendees.split(',').filter(Boolean);
      for (const uId of list) {
        if (uId !== created_by) {
          const notifId = crypto.randomUUID()
          await c.env.DB.prepare(`
            INSERT INTO ops_notifications (id, user_id, title, description, type)
            VALUES (?, ?, ?, ?, ?)
          `).bind(notifId, uId, `New ${event_type || 'Event'}`, `You have been invited to "${title}".`, 'Alert').run()
        }
      }
    }

    return c.json({ id, status: 'created' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.put('/events/:id', async (c) => {
  const id = c.req.param('id')
  const updates = await c.req.json()
  const sets = []
  const values = []
  
  const allowedFields = ['title', 'description', 'event_type', 'start_time', 'end_time', 'location', 'attendees']
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      sets.push(`${field} = ?`)
      values.push(updates[field])
    }
  }
  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400)
  
  sets.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)

  try {
    await c.env.DB.prepare(`
      UPDATE ops_events SET ${sets.join(', ')} WHERE id = ?
    `).bind(...values).run()
    return c.json({ status: 'updated' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

ops.delete('/events/:id', async (c) => {
  const id = c.req.param('id')
  try {
    await c.env.DB.prepare('DELETE FROM ops_events WHERE id = ?').bind(id).run()
    return c.json({ status: 'deleted' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})


/**
 * Chat System
 */

// Get all channels the user is in
ops.get('/chat/channels', async (c) => {
  const userId = c.req.header('X-Staff-ID')
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const channels = await c.env.DB.prepare(`
      SELECT c.* 
      FROM ops_chat_channels c
      JOIN ops_chat_channel_members m ON c.id = m.channel_id
      WHERE m.user_id = ?
    `).bind(userId).all()
    return c.json(channels.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

// Get messages for a channel
ops.get('/chat/channels/:id/messages', async (c) => {
  const channelId = c.req.param('id')
  try {
    const messages = await c.env.DB.prepare(`
      SELECT m.*, e.full_name as sender_name, e.profile_picture as sender_avatar,
             (SELECT count(*) FROM ops_chat_messages WHERE parent_id = m.id) as reply_count,
             (SELECT json_group_array(json_object('user_id', r.user_id, 'emoji', r.emoji)) 
              FROM ops_chat_reactions r WHERE r.message_id = m.id) as reactions
      FROM ops_chat_messages m
      JOIN employees e ON m.sender_id = e.id
      WHERE m.channel_id = ? AND m.parent_id IS NULL
      ORDER BY m.created_at ASC
    `).bind(channelId).all()
    return c.json(messages.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

// Send a message
ops.post('/chat/messages', async (c) => {
  const userId = c.req.header('X-Staff-ID')
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const { channel_id, receiver_id, content, parent_id } = await c.req.json()
  const id = crypto.randomUUID()
  
  try {
    await c.env.DB.prepare(`
      INSERT INTO ops_chat_messages (id, channel_id, sender_id, receiver_id, content, parent_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, channel_id || null, userId, receiver_id || null, content, parent_id || null).run()
    
    // Create Notification
    if (receiver_id) { // DM
      const notifId = crypto.randomUUID()
      const sender = await c.env.DB.prepare(`SELECT full_name FROM employees WHERE id = ?`).bind(userId).first()
      const sender_name = (sender?.full_name as string) || 'Someone'
      await c.env.DB.prepare(`
        INSERT INTO ops_notifications (id, user_id, title, description, type)
        VALUES (?, ?, ?, ?, ?)
      `).bind(notifId, receiver_id, `New Message:DM:${sender_name}`, `Message from ${sender_name}: "${content.substring(0, 20)}..."`, 'Alert').run()
    } else if (channel_id) { // Channel
      const channel = await c.env.DB.prepare(`SELECT name FROM ops_chat_channels WHERE id = ?`).bind(channel_id).first()
      const channel_name = (channel?.name as string) || 'Unknown'
      // Get all members of the channel
      const members = await c.env.DB.prepare('SELECT user_id FROM ops_chat_channel_members WHERE channel_id = ?').bind(channel_id).all()
      for (const m of members.results as any[]) {
        if (m.user_id !== userId) {
          const notifId = crypto.randomUUID()
          await c.env.DB.prepare(`
            INSERT INTO ops_notifications (id, user_id, title, description, type)
            VALUES (?, ?, ?, ?, ?)
          `).bind(notifId, m.user_id, `New Message:Channel:${channel_name}`, `New message in #${channel_name}.`, 'Alert').run()
        }
      }
    }
    
    return c.json({ id, status: 'sent' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

// Get direct messages with a user
ops.get('/chat/direct/:userId', async (c) => {
  const myId = c.req.header('X-Staff-ID')
  const otherId = c.req.param('userId')
  if (!myId) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const messages = await c.env.DB.prepare(`
      SELECT m.*, e.full_name as sender_name, e.profile_picture as sender_avatar,
             (SELECT count(*) FROM ops_chat_messages WHERE parent_id = m.id) as reply_count,
             (SELECT json_group_array(json_object('user_id', r.user_id, 'emoji', r.emoji)) 
              FROM ops_chat_reactions r WHERE r.message_id = m.id) as reactions
      FROM ops_chat_messages m
      JOIN employees e ON m.sender_id = e.id
      WHERE ((m.sender_id = ? AND m.receiver_id = ?)
         OR (m.sender_id = ? AND m.receiver_id = ?))
         AND m.parent_id IS NULL
      ORDER BY m.created_at ASC
    `).bind(myId, otherId, otherId, myId).all()
    return c.json(messages.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

// Create a channel
ops.post('/chat/channels', async (c) => {
  const userId = c.req.header('X-Staff-ID')
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  const { name, description, is_private, members } = await c.req.json()
  const id = crypto.randomUUID()
  
  try {
    await c.env.DB.prepare(`
      INSERT INTO ops_chat_channels (id, name, description, is_private, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, name, description || null, is_private ? 1 : 0, userId).run()
    
    // Add creator as member
    await c.env.DB.prepare(`
      INSERT INTO ops_chat_channel_members (channel_id, user_id)
      VALUES (?, ?)
    `).bind(id, userId).run()
    
    // Add other members if provided
    if (members && Array.isArray(members)) {
      for (const mId of members) {
        if (mId !== userId) {
          await c.env.DB.prepare(`
            INSERT INTO ops_chat_channel_members (channel_id, user_id)
            VALUES (?, ?)
          `).bind(id, mId).run()
        }
      }
    }
    
    return c.json({ id, status: 'created' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

// Get thread messages
ops.get('/chat/messages/:id/threads', async (c) => {
  const parentId = c.req.param('id')
  try {
    const messages = await c.env.DB.prepare(`
      SELECT m.*, e.full_name as sender_name, e.profile_picture as sender_avatar,
             (SELECT json_group_array(json_object('user_id', r.user_id, 'emoji', r.emoji)) 
              FROM ops_chat_reactions r WHERE r.message_id = m.id) as reactions
      FROM ops_chat_messages m
      JOIN employees e ON m.sender_id = e.id
      WHERE m.parent_id = ?
      ORDER BY m.created_at ASC
    `).bind(parentId).all()
    return c.json(messages.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

// Edit a message
ops.put('/chat/messages/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.req.header('X-Staff-ID')
  const { content } = await c.req.json()
  
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const msg = await c.env.DB.prepare('SELECT sender_id FROM ops_chat_messages WHERE id = ?').bind(id).first()
    if (!msg) return c.json({ error: 'Message not found' }, 404)
    if (msg.sender_id !== userId) return c.json({ error: 'Forbidden' }, 403)

    await c.env.DB.prepare(`
      UPDATE ops_chat_messages 
      SET content = ?, is_edited = 1 
      WHERE id = ?
    `).bind(content, id).run()
    
    return c.json({ status: 'updated' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

// Delete a message
ops.delete('/chat/messages/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.req.header('X-Staff-ID')
  
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const msg = await c.env.DB.prepare('SELECT sender_id FROM ops_chat_messages WHERE id = ?').bind(id).first()
    if (!msg) return c.json({ error: 'Message not found' }, 404)
    if (msg.sender_id !== userId) return c.json({ error: 'Forbidden' }, 403)

    await c.env.DB.prepare('DELETE FROM ops_chat_messages WHERE id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM ops_chat_messages WHERE parent_id = ?').bind(id).run()
    await c.env.DB.prepare('DELETE FROM ops_chat_reactions WHERE message_id = ?').bind(id).run()
    
    return c.json({ status: 'deleted' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

// Add a reaction
ops.post('/chat/messages/:id/reactions', async (c) => {
  const messageId = c.req.param('id')
  const userId = c.req.header('X-Staff-ID')
  const { emoji } = await c.req.json()
  
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  try {
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO ops_chat_reactions (message_id, user_id, emoji)
      VALUES (?, ?, ?)
    `).bind(messageId, userId, emoji).run()
    
    return c.json({ status: 'added' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

// Remove a reaction
ops.delete('/chat/messages/:id/reactions', async (c) => {
  const messageId = c.req.param('id')
  const userId = c.req.header('X-Staff-ID')
  const { emoji } = await c.req.json()
  
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)

  try {
    await c.env.DB.prepare(`
      DELETE FROM ops_chat_reactions 
      WHERE message_id = ? AND user_id = ? AND emoji = ?
    `).bind(messageId, userId, emoji).run()
    
    return c.json({ status: 'removed' })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})


export default ops
