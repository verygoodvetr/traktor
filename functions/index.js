const { onRequest, onCall } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { Resend } = require('resend')
const crypto = require('crypto')

initializeApp()

const db = getFirestore()
const resend = new Resend(process.env.RESEND_API_KEY)
const DELETION_SECRET = process.env.DELETION_SECRET
const APP_URL = 'https://traktor.vercel.app' // update this after deploying

function generateToken(uid) {
  return crypto.createHmac('sha256', DELETION_SECRET).update(uid).digest('hex')
}

// Called from the frontend when user requests deletion
exports.requestDeletion = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new Error('Unauthenticated')

  const user = await getAuth().getUser(uid)
  const email = user.email
  const displayName = user.displayName || 'there'
  const deletionDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const token = generateToken(uid)

  // Mark account as pending deletion
  await db.collection('users').doc(uid).set({
    pendingDeletion: true,
    deletionRequestedAt: new Date().toISOString(),
    deletionScheduledFor: deletionDate.toISOString()
  }, { merge: true })

  // Send email
  await resend.emails.send({
    from: 'Traktor <onboarding@resend.dev>',
    to: email,
    subject: 'Your Traktor account deletion request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #141414; color: #ffffff; padding: 32px; border-radius: 8px;">
        <h1 style="color: #e50914;">Traktor</h1>
        <h2>Account deletion requested</h2>
        <p>Hi ${displayName},</p>
        <p>We received a request to delete your Traktor account. Your account will be automatically deleted on <strong>${deletionDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>.</p>
        <p>If you changed your mind, you can cancel the deletion at any time before that date:</p>
        <a href="${APP_URL}/cancel-deletion?uid=${uid}&token=${token}" style="display: inline-block; background: #2a2a2a; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">Cancel deletion</a>
        <p>If you want to delete your account immediately instead:</p>
        <a href="${APP_URL}/confirm-deletion?uid=${uid}&token=${token}" style="display: inline-block; background: #e50914; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">Delete my account now</a>
        <p style="opacity: 0.6; font-size: 13px; margin-top: 32px;">If you did not request this, please cancel immediately using the button above and change your password.</p>
      </div>
    `
  })

  return { success: true, deletionDate: deletionDate.toISOString() }
})

// Called from the frontend to cancel deletion
exports.cancelDeletion = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new Error('Unauthenticated')

  await db.collection('users').doc(uid).set({
    pendingDeletion: false,
    deletionRequestedAt: null,
    deletionScheduledFor: null
  }, { merge: true })

  return { success: true }
})

// Called from email link to delete immediately
exports.confirmDeletion = onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', APP_URL)
  const { uid, token } = req.query

  if (!uid || !token || token !== generateToken(uid)) {
    return res.redirect(`${APP_URL}?deleted=invalid`)
  }

  try {
    await deleteUserData(uid)
    return res.redirect(`${APP_URL}?deleted=true`)
  } catch (err) {
    console.error(err)
    return res.redirect(`${APP_URL}?deleted=error`)
  }
})

// Called from email link to cancel deletion
exports.cancelDeletionLink = onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', APP_URL)
  const { uid, token } = req.query

  if (!uid || !token || token !== generateToken(uid)) {
    return res.redirect(`${APP_URL}?cancelled=invalid`)
  }

  await db.collection('users').doc(uid).set({
    pendingDeletion: false,
    deletionRequestedAt: null,
    deletionScheduledFor: null
  }, { merge: true })

  return res.redirect(`${APP_URL}?cancelled=true`)
})

// Runs every day at midnight to delete accounts that are due
exports.scheduledDeletion = onSchedule('0 0 * * *', async () => {
  const now = new Date().toISOString()
  const snap = await db.collection('users')
    .where('pendingDeletion', '==', true)
    .where('deletionScheduledFor', '<=', now)
    .get()

  for (const doc of snap.docs) {
    try {
      await deleteUserData(doc.id)
    } catch (err) {
      console.error(`Failed to delete user ${doc.id}:`, err)
    }
  }
})

async function deleteUserData(uid) {
  // Delete all subcollections
  const subcollections = ['watched', 'watchlist', 'episodes']
  for (const sub of subcollections) {
    const snap = await db.collection('users').doc(uid).collection(sub).get()
    const batch = db.batch()
    snap.docs.forEach(doc => batch.delete(doc.ref))
    await batch.commit()
  }

  // Delete user document
  await db.collection('users').doc(uid).delete()

  // Delete Firebase Auth account
  await getAuth().deleteUser(uid)
}