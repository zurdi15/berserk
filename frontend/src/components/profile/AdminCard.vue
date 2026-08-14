<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  adminListUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  adminCreateInvite,
  adminListInvites,
  adminDeleteInvite,
  type UserOut,
  type InviteOut,
} from '@/api/domain'
import { restoreBackup, BACKUP_EXPORT_URL } from '@/api/backup'
import { switchActAs } from '@/utils/actAs'
import { toastApiError } from '@/utils/apiErrors'
import { parseUtc } from '@/utils/datetime'
import { isPasswordValid, passwordErrorKey } from '@/utils/passwordValidation'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import BkCard from '@/lib/BkCard.vue'
import BkField from '@/lib/BkField.vue'
import BkButton from '@/lib/BkButton.vue'
import BkActionBtn from '@/lib/BkActionBtn.vue'
import BkSheet from '@/lib/BkSheet.vue'
import BkUser from '@/lib/BkUser.vue'
import ColorSwatchPicker from '@/lib/ColorSwatchPicker.vue'

const { t } = useI18n()
const auth = useAuthStore()
const toast = useToastStore()

// Users section
const users = ref<UserOut[]>([])
const createUsername = ref('')
const createPassword = ref('')
const createIsAdmin = ref(false)
const createError = ref('')
const isCreatingUser = ref(false)
const createUserOpen = ref(false)
const resetPasswordOpen = ref(false)
const resetUserId = ref<number | null>(null)
const resetNewPassword = ref('')
const resetError = ref('')
const isResettingPassword = ref(false)

// item (v0.4.0): validación de cliente ANTES de someter, en los DOS
// formularios que piden una contraseña aquí — mismo arreglo que
// PasswordCard.vue/BootstrapView.vue/RedeemView.vue (ver apiErrors.ts para
// la parte servidor, defensa en profundidad)
const createPasswordError = computed(() => {
  const key = passwordErrorKey(createPassword.value)
  return key ? t(key) : ''
})
const resetPasswordFieldError = computed(() => {
  const key = passwordErrorKey(resetNewPassword.value)
  return key ? t(key) : resetError.value
})

// Edit user sheet (item, v0.4.0): username/color/is_admin en un único sheet
// — el reseteo de contraseña se queda como su propio icono/sheet aparte a
// propósito (ver el why-comment junto al icono "key" más abajo, en el
// template)
const editUserOpen = ref(false)
const editUserId = ref<number | null>(null)
const editUsername = ref('')
const editColor = ref<string | null>(null)
const editIsAdmin = ref(false)
const editError = ref('')
const isSavingEdit = ref(false)

// Delete user confirmation
const deleteUserConfirmOpen = ref(false)
const deleteUserId = ref<number | null>(null)

// Invites section
const invites = ref<InviteOut[]>([])
const newToken = ref<string | null>(null)
const isCreatingInvite = ref(false)
const deleteInviteConfirmOpen = ref(false)
const deleteInviteId = ref<number | null>(null)

// Backup section
const restoreFileInput = ref<HTMLInputElement | null>(null)
const restoreFile = ref<File | null>(null)
const restoreConfirmOpen = ref(false)
const isRestoring = ref(false)

// item 6 (v0.4.0): UNA sola bandera para las dos tablas — antes usersReady/
// invitesReady eran independientes y, como loadUsers()/loadInvites() se
// esperaban en secuencia, la tabla de usuarios aparecía primero y ~100ms
// después la de invitaciones la seguía, empujando el layout (salto visible).
// Mismo patrón "aparece una vez, completo" que TodayView/RoutineList: las dos
// cargas van en paralelo (Promise.all) y el panel entero se gatea en su
// resolución conjunta — true también si alguna falla, para no dejar la
// sección en blanco.
const ready = ref(false)

onMounted(async () => {
  await Promise.all([loadUsers(), loadInvites()])
  ready.value = true
})

async function loadUsers() {
  try {
    users.value = await adminListUsers()
  } catch (error) {
    toastApiError(error)
  }
}

async function loadInvites() {
  try {
    invites.value = await adminListInvites()
  } catch (error) {
    toastApiError(error)
  }
}

function openCreateUser() {
  createUsername.value = ''
  createPassword.value = ''
  createIsAdmin.value = false
  createError.value = ''
  createUserOpen.value = true
}

async function handleCreateUser() {
  if (!isPasswordValid(createPassword.value)) return

  createError.value = ''
  isCreatingUser.value = true

  try {
    await adminCreateUser({
      username: createUsername.value,
      password: createPassword.value,
      is_admin: createIsAdmin.value,
    })
    createUsername.value = ''
    createPassword.value = ''
    createIsAdmin.value = false
    createUserOpen.value = false
    await loadUsers()
    toast.push('info', t('common.saved'))
  } catch (error) {
    if (error instanceof ApiError && error.slug === 'username_taken') {
      createError.value = t(`errors.${error.slug}`)
    } else {
      toastApiError(error)
    }
  } finally {
    isCreatingUser.value = false
  }
}

function handleResetPassword(userId: number) {
  resetUserId.value = userId
  resetNewPassword.value = ''
  resetError.value = ''
  resetPasswordOpen.value = true
}

async function confirmResetPassword() {
  if (resetUserId.value === null) return
  if (!isPasswordValid(resetNewPassword.value)) return

  resetError.value = ''
  isResettingPassword.value = true

  try {
    await adminUpdateUser(resetUserId.value, {
      password: resetNewPassword.value,
    })
    resetPasswordOpen.value = false
    await loadUsers()
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  } finally {
    isResettingPassword.value = false
  }
}

function openEditUser(user: UserOut) {
  editUserId.value = user.id
  editUsername.value = user.username
  editColor.value = user.color ?? null
  editIsAdmin.value = user.is_admin
  editError.value = ''
  editUserOpen.value = true
}

async function confirmEditUser() {
  if (editUserId.value === null) return

  editError.value = ''
  isSavingEdit.value = true

  try {
    await adminUpdateUser(editUserId.value, {
      username: editUsername.value,
      color: editColor.value,
      // el propio usuario no puede auto-degradarse (ver el checkbox oculto
      // en su propia fila más abajo): editIsAdmin se queda en su valor
      // inicial (true) cuando es la fila propia, así que reenviarlo tal
      // cual es siempre un no-op seguro, nunca un intento de demote
      is_admin: editIsAdmin.value,
    })
    editUserOpen.value = false
    await loadUsers()
    toast.push('info', t('common.saved'))
  } catch (error) {
    if (error instanceof ApiError && error.slug === 'username_taken') {
      editError.value = t(`errors.${error.slug}`)
    } else {
      toastApiError(error)
    }
  } finally {
    isSavingEdit.value = false
  }
}

function handleDeleteUser(userId: number) {
  deleteUserId.value = userId
  deleteUserConfirmOpen.value = true
}

async function confirmDeleteUser() {
  if (deleteUserId.value === null) return

  deleteUserConfirmOpen.value = false
  try {
    await adminDeleteUser(deleteUserId.value)
    await loadUsers()
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  }
}

async function handleCreateInvite() {
  isCreatingInvite.value = true
  try {
    const result = await adminCreateInvite()
    newToken.value = result.token
    await loadInvites()
  } catch (error) {
    toastApiError(error)
  } finally {
    isCreatingInvite.value = false
  }
}

async function handleCopyToken() {
  if (!newToken.value) return

  try {
    await navigator.clipboard.writeText(redeemUrl(newToken.value))
    toast.push('info', t('common.saved'))
  } catch {
    // Silently fail if clipboard is not available
  }
}

function handleDeleteInvite(inviteId: number) {
  deleteInviteId.value = inviteId
  deleteInviteConfirmOpen.value = true
}

async function confirmDeleteInvite() {
  if (deleteInviteId.value === null) return

  deleteInviteConfirmOpen.value = false
  try {
    await adminDeleteInvite(deleteInviteId.value)
    await loadInvites()
    toast.push('info', t('common.saved'))
  } catch (error) {
    toastApiError(error)
  }
}

function openRestorePicker() {
  restoreFileInput.value?.click()
}

function onRestoreFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (!file) return
  restoreFile.value = file
  restoreConfirmOpen.value = true
}

function cancelRestore() {
  restoreConfirmOpen.value = false
  restoreFile.value = null
  if (restoreFileInput.value) restoreFileInput.value.value = ''
}

async function confirmRestore() {
  if (!restoreFile.value) return

  isRestoring.value = true
  try {
    await restoreBackup(restoreFile.value)
    restoreConfirmOpen.value = false
    toast.push('info', t('admin.backup.restoreSuccess'))
    // la DB restaurada decide quién sigue con sesión: recargar es la única
    // forma fiable de que el resto de la app vea el estado nuevo de golpe
    window.location.reload()
  } catch (error) {
    toastApiError(error)
  } finally {
    isRestoring.value = false
    if (restoreFileInput.value) restoreFileInput.value.value = ''
  }
}

function isOwnUser(userId: number): boolean {
  return userId === auth.user?.id
}

// v0.17.0 act-as (zurdi: "que los admin puedan editar las rutinas,
// ejercicios, etc. de cualquier usuario, como si estuviesen logados como ese
// usuario"): purga el estado local por-usuario, fija el modo y recarga —
// desde el boot siguiente TODA la app opera como el usuario elegido (ver
// utils/actAs.ts); el banner del shell es la vuelta atrás
function actAsUser(user: UserOut) {
  void switchActAs({ id: user.id, username: user.username })
}

function formatDate(dateString: string): string {
  return parseUtc(dateString).toLocaleDateString()
}

function isInviteUsed(invite: InviteOut): boolean {
  return invite.used_at !== null
}

// el token bare no es un destino: la persona invitada necesita la URL completa
function redeemUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`
}
</script>

<template>
  <div class="space-y-4">
    <!-- Users section -->
    <BkCard :title="$t('admin.users')">
      <div class="space-y-4">
        <!-- Users table: botones icon-only en móvil (aria-label), texto de
             vuelta desde sm — objetivo: sin scroll lateral en 390px. El
             overflow-x-auto queda como red de seguridad, no como caso normal.
             Gateada en ready (item 6: única bandera compartida con invites,
             ver script): sin esto, el "sin usuarios" aparece y ~100ms
             después la tabla real la reemplaza de golpe. -->
        <!-- item 2/3 (v0.4.3, zurdi): esqueleto shimmer mientras carga, mismo
             hueco que una fila real (nombre a la izquierda, dos acciones
             icon-only a la derecha) — reemplaza el gate a blanco que hacía
             saltar el layout al llegar los datos. -->
        <div v-if="!ready" class="space-y-1" data-testid="admin-users-skeleton">
          <div
            v-for="n in 4"
            :key="n"
            class="flex items-center justify-between py-2 px-2"
            aria-hidden="true"
          >
            <div class="h-4 w-1/3 rounded-sm bk-shimmer" />
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-sm bk-shimmer" />
              <div class="w-8 h-8 rounded-sm bk-shimmer" />
            </div>
          </div>
        </div>

        <div v-else-if="users.length > 0" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-line">
                <th class="text-left py-2 px-2">{{ $t('admin.username') }}</th>
                <th class="text-left py-2 px-2"><span class="sr-only">{{ $t('admin.actions') }}</span></th>
              </tr>
            </thead>
            <!-- v0.11.7: borrar un usuario difumina su fila en el sitio
                 (bk-remove-row — un <tr> no admite el position:absolute de
                 bk-remove sin romper la tabla) -->
            <tbody class="divide-y divide-line">
              <TransitionGroup name="bk-remove-row">
              <tr v-for="user in users" :key="user.id" :data-testid="`user-row-${user.id}`" class="hover:bg-stone/30">
                <td class="py-2 px-2">
                  <span class="inline-flex items-center gap-2">
                    <!-- item 5: BkUser (punto de color + nombre) en vez del
                         username a pelo — la estrella de admin se compone AL
                         LADO, fuera del propio componente (no es "parte del
                         usuario", es un dato de rol de esta tabla) -->
                    <BkUser :user="user" />
                    <!-- estrella en vez de columna: la columna "Administrador"
                         ensanchaba la tabla en móvil sin aportar mucho más que
                         esto — la etiqueta accesible reutiliza admin.isAdmin,
                         ya tiene exactamente el texto que hacía falta -->
                    <span v-if="user.is_admin" class="text-aurora font-semibold" data-testid="admin-badge">
                      ✦
                      <span class="sr-only">{{ $t('admin.isAdmin') }}</span>
                    </span>
                  </span>
                </td>
                <td class="py-2 px-2">
                  <div class="flex justify-end gap-2">
                    <!-- icon-only en todos los tamaños ahora (BkActionBtn,
                         item 7): el "hidden sm:inline" de antes ya no hace
                         falta, ese era justo el punto de unificar -->
                    <!-- item (v0.4.0): editar (nombre/color/admin) SÍ está
                         disponible en la propia fila — un admin puede
                         cambiarse su propio nombre/color, el sheet solo
                         oculta el checkbox de admin para uno mismo (ver
                         template del sheet más abajo) -->
                    <BkActionBtn
                      icon="edit"
                      :aria-label="$t('common.edit')"
                      data-testid="edit-user-btn"
                      @click="openEditUser(user)"
                    />
                    <!-- v0.17.0 act-as: entrar como este usuario — toda la
                         app pasa a operar con su identidad hasta salir desde
                         el banner del shell -->
                    <BkActionBtn
                      v-if="!isOwnUser(user.id)"
                      icon="view"
                      :aria-label="$t('admin.actAs')"
                      data-testid="act-as-user-btn"
                      @click="actAsUser(user)"
                    />
                    <!-- resetear contraseña se queda como su propio icono/
                         sheet, no dentro del de editar: es una acción de
                         seguridad deliberada (echa al usuario de todos sus
                         dispositivos) — mezclarla con "corregir el nombre"
                         invitaría a tocarla sin querer al editar otra cosa -->
                    <BkActionBtn
                      v-if="!isOwnUser(user.id)"
                      icon="key"
                      :aria-label="$t('admin.resetPassword')"
                      data-testid="reset-password-btn"
                      @click="handleResetPassword(user.id)"
                    />
                    <BkActionBtn
                      v-if="!isOwnUser(user.id)"
                      icon="delete"
                      :aria-label="$t('common.delete')"
                      data-testid="delete-user-btn"
                      @click="handleDeleteUser(user.id)"
                    />
                  </div>
                </td>
              </tr>
              </TransitionGroup>
            </tbody>
          </table>
        </div>

        <div v-else class="text-sm text-ink-muted">
          {{ $t('admin.noUsers') }}
        </div>

        <!-- Crear usuario: dialog en vez de form inline (sin divider extra
             entre la tabla y esto — space-y-4 del contenedor ya separa) -->
        <div>
          <BkButton data-testid="open-create-user-btn" @click="openCreateUser">
            {{ $t('admin.createUser') }}
          </BkButton>
        </div>
      </div>
    </BkCard>

    <!-- Invites section -->
    <BkCard :title="$t('admin.invites')">
      <div class="space-y-4">
        <!-- item 2/3 (v0.4.3, zurdi): mismo esqueleto shimmer que la tabla de
             usuarios (gateada en el mismo `ready`, ver arriba) -->
        <div v-if="!ready" class="space-y-2" data-testid="admin-invites-skeleton">
          <div
            v-for="n in 2"
            :key="n"
            class="p-2 rounded border border-line space-y-1.5"
            aria-hidden="true"
          >
            <div class="h-3 w-1/2 rounded-sm bk-shimmer" />
            <div class="h-3 w-1/3 rounded-sm bk-shimmer" />
          </div>
        </div>

        <!-- Invites list: gateada en el MISMO ready que la tabla de usuarios
             (item 6) — antes tenía su propia bandera y aparecía en un
             segundo salto separado. v0.11.1 (zurdi): la lista va PRIMERO y
             el botón de generar debajo (el h3 duplicado del título de la
             card murió con la reordenación) -->
        <!-- v0.11.7: borrar una invitación difumina su fila (bk-remove) -->
        <div v-else-if="invites.length > 0" class="relative space-y-2">
          <TransitionGroup name="bk-remove">
          <div
            v-for="invite in invites"
            :key="invite.id"
            class="flex items-center justify-between p-2 rounded border border-line text-sm"
            :data-testid="`invite-row-${invite.id}`"
          >
            <div>
              <div>
                <span class="text-ink-muted">{{ $t('admin.created') }}: </span>
                {{ formatDate(invite.created_at) }}
              </div>
              <div>
                <span class="text-ink-muted">{{ $t('admin.expires') }}: </span>
                {{ formatDate(invite.expires_at) }}
              </div>
              <div v-if="isInviteUsed(invite)" class="text-ink-muted">
                {{ $t('admin.used') }}: {{ formatDate(invite.used_at || '') }}
              </div>
              <div v-else class="text-aurora">
                {{ $t('admin.pending') }}
              </div>
            </div>
            <BkButton
              variant="danger"
              size="sm"
              data-testid="delete-invite-btn"
              @click="handleDeleteInvite(invite.id)"
            >
              {{ $t('common.delete') }}
            </BkButton>
          </div>
          </TransitionGroup>
        </div>

        <div v-else class="text-sm text-ink-muted">
          {{ $t('admin.noInvites') }}
        </div>

        <!-- v0.11.1 (zurdi): generar VA DEBAJO de las invitaciones (o del
             mensaje de vacío) — el token recién creado se muestra junto al
             botón que lo generó -->
        <div class="space-y-3 pt-4 border-t border-line">
          <BkButton
            :loading="isCreatingInvite"
            data-testid="create-invite-btn"
            @click="handleCreateInvite"
          >
            {{ $t('admin.generateInvite') }}
          </BkButton>

          <div v-if="newToken" class="space-y-2">
            <div class="text-sm text-ink-muted">{{ $t('admin.token') }}</div>
            <div class="bk-slab p-3 mono text-sm break-all" data-testid="token-display">
              {{ newToken }}
            </div>
            <div class="flex gap-2">
              <BkButton
                variant="ghost"
                size="sm"
                data-testid="copy-token-btn"
                @click="handleCopyToken"
              >
                {{ $t('admin.copyToken') }}
              </BkButton>
            </div>
            <div class="text-xs text-ink-muted italic">
              {{ $t('admin.tokenOnce') }}
            </div>
          </div>
        </div>
      </div>
    </BkCard>

    <!-- Backup section -->
    <BkCard :title="$t('admin.backup.title')">
      <div class="flex flex-wrap gap-2">
        <!-- anchor real (no fetch+blob): mismas clases que BkButton variant
             primary/md para que se vea igual, pero navega de verdad — un
             ZIP puede pesar cientos de MB y el navegador ya sabe transmitir
             una descarga de FileResponse sin que JS tenga que bufferearla -->
        <a
          :href="BACKUP_EXPORT_URL"
          download
          data-testid="export-backup-link"
          class="bk-press inline-flex items-center justify-center gap-2 font-display font-semibold uppercase tracking-wide rounded-sm border transition-colors px-5 py-2.5 bg-aurora-deep border-aurora text-ink hover:bg-aurora hover:text-void"
        >
          {{ $t('admin.backup.export') }}
        </a>
        <BkButton
          variant="ghost"
          data-testid="restore-backup-btn"
          @click="openRestorePicker"
        >
          {{ $t('admin.backup.restore') }}
        </BkButton>
        <input
          ref="restoreFileInput"
          type="file"
          accept=".zip"
          class="hidden"
          data-testid="restore-backup-input"
          @change="onRestoreFileSelected"
        />
      </div>
    </BkCard>

    <!-- Create user sheet -->
    <BkSheet
      :open="createUserOpen"
      :title="$t('admin.createUser')"
      @close="createUserOpen = false"
    >
      <div class="space-y-4 p-4">
        <BkField
          v-model="createUsername"
          :label="$t('admin.username')"
          :error="createError"
          data-testid="create-username-field"
        />
        <BkField
          v-model="createPassword"
          type="password"
          :label="$t('admin.password')"
          :error="createPasswordError"
          data-testid="create-password-field"
        />
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            v-model="createIsAdmin"
            type="checkbox"
            class="rounded border border-line"
            data-testid="create-is-admin-checkbox"
          />
          <span class="text-sm text-ink-muted">{{ $t('admin.isAdmin') }}</span>
        </label>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            @click="createUserOpen = false"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            :loading="isCreatingUser"
            :disabled="!isPasswordValid(createPassword)"
            data-testid="create-user-btn"
            @click="handleCreateUser"
          >
            {{ $t('common.save') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <!-- Password reset sheet -->
    <BkSheet
      :open="resetPasswordOpen"
      :title="$t('admin.resetPassword')"
      @close="resetPasswordOpen = false"
    >
      <div class="space-y-4 p-4">
        <BkField
          v-model="resetNewPassword"
          type="password"
          :label="$t('admin.newPassword')"
          :error="resetPasswordFieldError"
          data-testid="reset-password-field"
        />
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            @click="resetPasswordOpen = false"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            :loading="isResettingPassword"
            :disabled="!isPasswordValid(resetNewPassword)"
            data-testid="confirm-reset-password-btn"
            @click="confirmResetPassword"
          >
            {{ $t('common.save') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <!-- Edit user sheet (item, v0.4.0): username/color/is_admin — el
         reseteo de contraseña se queda fuera a propósito (ver el
         why-comment junto al icono "key" arriba, en la fila de la tabla) -->
    <BkSheet
      :open="editUserOpen"
      :title="$t('admin.editUser')"
      @close="editUserOpen = false"
    >
      <div class="space-y-4 p-4">
        <BkField
          v-model="editUsername"
          :label="$t('admin.username')"
          :error="editError"
          data-testid="edit-username-field"
        />
        <ColorSwatchPicker v-model="editColor" :label="$t('profile.color')" />
        <!-- item: el checkbox de admin se OCULTA (no solo se deshabilita)
             en la propia fila — mismo criterio visual que resetear/borrar,
             que ya desaparecen del todo para uno mismo en vez de quedar
             ahí sin poder tocarse -->
        <label
          v-if="editUserId !== null && !isOwnUser(editUserId)"
          class="flex items-center gap-2 cursor-pointer"
        >
          <input
            v-model="editIsAdmin"
            type="checkbox"
            class="rounded border border-line"
            data-testid="edit-is-admin-checkbox"
          />
          <span class="text-sm text-ink-muted">{{ $t('admin.isAdmin') }}</span>
        </label>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            @click="editUserOpen = false"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            :loading="isSavingEdit"
            data-testid="save-edit-user-btn"
            @click="confirmEditUser"
          >
            {{ $t('common.save') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <!-- Delete user confirmation sheet -->
    <BkSheet
      :open="deleteUserConfirmOpen"
      :title="$t('admin.confirmDeleteUser')"
      @close="deleteUserConfirmOpen = false"
      data-testid="delete-user-confirm-sheet"
    >
      <div class="space-y-4 p-4">
        <p>{{ $t('admin.confirmDeleteUserMessage') }}</p>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            @click="deleteUserConfirmOpen = false"
            data-testid="delete-user-cancel-btn"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            variant="danger"
            @click="confirmDeleteUser"
            data-testid="delete-user-confirm-btn"
          >
            {{ $t('common.delete') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <!-- Delete invite confirmation sheet -->
    <BkSheet
      :open="deleteInviteConfirmOpen"
      :title="$t('admin.confirmDeleteInvite')"
      @close="deleteInviteConfirmOpen = false"
      data-testid="delete-invite-confirm-sheet"
    >
      <div class="space-y-4 p-4">
        <p>{{ $t('admin.confirmDeleteInviteMessage') }}</p>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            @click="deleteInviteConfirmOpen = false"
            data-testid="delete-invite-cancel-btn"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            variant="danger"
            @click="confirmDeleteInvite"
            data-testid="delete-invite-confirm-btn"
          >
            {{ $t('common.delete') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>

    <!-- Restore backup confirmation sheet -->
    <BkSheet
      :open="restoreConfirmOpen"
      :title="$t('admin.backup.confirmTitle')"
      @close="cancelRestore"
      data-testid="restore-backup-confirm-sheet"
    >
      <div class="space-y-4 p-4">
        <p>{{ $t('admin.backup.confirmHint') }}</p>
        <div class="flex gap-2">
          <BkButton
            variant="ghost"
            @click="cancelRestore"
            data-testid="restore-backup-cancel-btn"
          >
            {{ $t('common.cancel') }}
          </BkButton>
          <BkButton
            variant="danger"
            :loading="isRestoring"
            @click="confirmRestore"
            data-testid="restore-backup-confirm-btn"
          >
            {{ $t('admin.backup.restore') }}
          </BkButton>
        </div>
      </div>
    </BkSheet>
  </div>
</template>
