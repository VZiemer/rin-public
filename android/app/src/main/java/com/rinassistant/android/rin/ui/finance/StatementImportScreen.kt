package com.rinassistant.android.rin.ui.finance

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.rinassistant.android.R
import com.rinassistant.android.rin.app.AppContainer
import com.rinassistant.android.rin.finance.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
fun StatementImportRoute(container: AppContainer, assistantId: String, onBack: () -> Unit) {
    var userId by remember { mutableStateOf(container.userSessionStore.read()?.userId) }
    var failed by remember { mutableStateOf(false) }
    var retry by remember { mutableIntStateOf(0) }
    LaunchedEffect(retry) {
        if (userId == null) {
            failed = false
            try { userId = container.userBootstrap.ensure().userId }
            catch (error: CancellationException) { throw error }
            catch (_: Exception) { failed = true }
        }
    }
    val id = userId
    if (id == null) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.safeDrawingPadding().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(stringResource(R.string.finance_title), style = MaterialTheme.typography.headlineSmall)
                if (failed) {
                    Text(stringResource(R.string.finance_error_session))
                    Button(onClick = { retry++ }) { Text(stringResource(R.string.finance_retry)) }
                } else CircularProgressIndicator()
                TextButton(onClick = onBack) { Text(stringResource(R.string.assistant_back)) }
            }
        }
        return
    }
    val context = androidx.compose.ui.platform.LocalContext.current
    val controller = remember(id, assistantId) {
        StatementImportController(assistantId, container.statementApi, PrefsPendingStatementStore(context.applicationContext, id, assistantId))
    }
    val files = remember { AndroidStatementFiles(context.applicationContext) }
    val scope = rememberCoroutineScope()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch { controller.selectFile { files.read(uri) } }
    }
    LaunchedEffect(controller) { controller.resume() }
    StatementImportScreen(controller, onBack) {
        picker.launch(arrayOf("text/csv", "text/comma-separated-values", "application/csv", "application/vnd.ms-excel", "text/plain"))
    }
}

@Composable
private fun StatementImportScreen(controller: StatementImportController, onBack: () -> Unit, onSelect: () -> Unit) {
    val state by controller.state.collectAsState()
    val scope = rememberCoroutineScope()
    var accountId by remember { mutableStateOf("") }
    var sourceKind by remember { mutableStateOf("bank") }
    var discardDialog by remember { mutableStateOf(false) }
    var leaveDialog by remember { mutableStateOf(false) }
    val goBack = { if (state.hasEdits && !state.commitUncertain) leaveDialog = true else onBack() }
    BackHandler(onBack = goBack)
    if (leaveDialog) {
        AlertDialog(
            onDismissRequest = { leaveDialog = false },
            title = { Text(stringResource(R.string.finance_leave_review)) },
            text = { Text(stringResource(R.string.finance_leave_explanation)) },
            confirmButton = { TextButton(onClick = { leaveDialog = false; onBack() }) { Text(stringResource(R.string.finance_leave_review)) } },
            dismissButton = { TextButton(onClick = { leaveDialog = false }) { Text(stringResource(R.string.assistant_cancel)) } },
        )
    }
    if (discardDialog) {
        AlertDialog(
            onDismissRequest = { discardDialog = false },
            title = { Text(stringResource(R.string.finance_new_import)) },
            text = { Text(stringResource(R.string.finance_discard_explanation)) },
            confirmButton = { TextButton(onClick = { controller.newImport(); discardDialog = false }) { Text(stringResource(R.string.finance_continue)) } },
            dismissButton = { TextButton(onClick = { discardDialog = false }) { Text(stringResource(R.string.assistant_cancel)) } },
        )
    }
    Surface(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.safeDrawingPadding().imePadding().fillMaxSize().padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(vertical = 16.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.finance_title), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
                    TextButton(onClick = goBack) { Text(stringResource(R.string.assistant_back)) }
                }
            }
            if (state.busy) item {
                LinearProgressIndicator(Modifier.fillMaxWidth())
                Text(stringResource(when (state.activity) {
                    StatementActivity.READING -> R.string.finance_reading
                    StatementActivity.UPLOADING -> R.string.finance_uploading
                    StatementActivity.COMMITTING -> R.string.finance_committing
                    else -> R.string.finance_checking
                }))
            }
            state.error?.let { error -> item {
                Text(stringResource(error.messageResource()), color = MaterialTheme.colorScheme.error)
            } }
            val job = state.job
            if (job == null) {
                item { Text(stringResource(R.string.finance_intro)) }
                item {
                    OutlinedButton(onClick = onSelect, enabled = !state.busy) { Text(stringResource(R.string.finance_select_file)) }
                    state.file?.let { file -> Text(stringResource(R.string.finance_selected_file, file.name, file.bytes.size)) }
                }
                state.batch?.takeIf { it.parts.size > 1 }?.let { batch ->
                    item { Text(stringResource(R.string.finance_csv_parts, batch.totalRows, batch.parts.size)) }
                    item { Text(stringResource(R.string.finance_csv_parts_resume), style = MaterialTheme.typography.bodySmall) }
                    items(batch.parts.indices.toList()) { index ->
                        Row(Modifier.fillMaxWidth().clickable(enabled = !state.busy) { controller.choosePart(index) }, verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = index == state.partIndex, onClick = null, enabled = !state.busy)
                            Text(stringResource(R.string.finance_csv_part_option, index + 1, batch.parts.size, batch.rowCounts[index]))
                        }
                    }
                }
                item {
                    OutlinedTextField(
                        accountId, { accountId = it }, enabled = !state.busy,
                        label = { Text(stringResource(R.string.finance_account)) },
                        supportingText = { Text(stringResource(R.string.finance_account_hint)) },
                        isError = accountId.isNotEmpty() && !validStatementAccount(accountId), singleLine = true, modifier = Modifier.fillMaxWidth(),
                    )
                }
                item {
                    Text(stringResource(R.string.finance_source))
                    ChoiceRow(sourceKind == "bank", R.string.finance_bank, !state.busy) { sourceKind = "bank" }
                    ChoiceRow(sourceKind == "card", R.string.finance_card, !state.busy) { sourceKind = "card" }
                }
                item { CheckRow(state.consent, R.string.finance_consent, !state.busy, controller::consent) }
                item { Text(stringResource(R.string.finance_privacy), style = MaterialTheme.typography.bodySmall) }
                item {
                    Button(
                        onClick = { scope.launch { controller.start(accountId, sourceKind) } },
                        enabled = !state.busy && state.file != null && state.consent && validStatementAccount(accountId),
                    ) { Text(stringResource(R.string.finance_analyze)) }
                }
            } else {
                if (state.partCount > 1) item { Text(stringResource(R.string.finance_csv_part_progress, state.partIndex + 1, state.partCount)) }
                item {
                    Text(stringResource(R.string.finance_job_account, job.accountId,
                        stringResource(if (job.sourceKind == "card") R.string.finance_card else R.string.finance_bank)))
                    Text(stringResource(R.string.finance_job_id, job.id), style = MaterialTheme.typography.bodySmall)
                }
                when (job.status) {
                    StatementStatus.UPLOADED_PENDING, StatementStatus.PROCESSING -> item {
                        Text(stringResource(if (state.busy) R.string.finance_processing else R.string.finance_paused))
                        if (!state.busy) Button(onClick = { scope.launch { controller.resume() } }) { Text(stringResource(R.string.finance_check_status)) }
                    }
                    StatementStatus.REVIEW -> {
                        item {
                            Text(stringResource(R.string.finance_review_intro))
                            Text(stringResource(R.string.finance_review_count, state.included.size, state.drafts.size), style = MaterialTheme.typography.titleMedium)
                        }
                        items(job.warnings) { warning -> Text(warning, color = MaterialTheme.colorScheme.error) }
                        items(state.drafts, key = { it.originalIndex }) { draft ->
                            StatementRowEditor(draft, draft.originalIndex in job.potentialDuplicates, state.editable) { edited ->
                                controller.edit(draft.originalIndex) { edited }
                            }
                        }
                        item {
                            if (state.included.any { it.toRow() == null }) Text(stringResource(R.string.finance_invalid_rows), color = MaterialTheme.colorScheme.error)
                            CheckRow(state.rowsConfirmed, R.string.finance_confirm_rows, state.editable, controller::confirmRows)
                            CheckRow(state.duplicatesConfirmed, R.string.finance_confirm_duplicates, state.editable, controller::confirmDuplicates)
                            Button(onClick = { scope.launch { controller.commit() } }, enabled = state.canCommit) { Text(stringResource(R.string.finance_commit)) }
                        }
                    }
                    StatementStatus.COMMITTING -> item {
                        Text(stringResource(R.string.finance_resume_commit))
                        Button(onClick = { scope.launch { controller.commit() } }, enabled = !state.busy && !state.commitUncertain) {
                            Text(stringResource(R.string.finance_resume_button))
                        }
                    }
                    StatementStatus.COMMITTED -> item {
                        Text(stringResource(R.string.finance_success), style = MaterialTheme.typography.titleMedium)
                        if (state.hasNextPart) Button(onClick = controller::nextPart, enabled = !state.busy) {
                            Text(stringResource(R.string.finance_next_part))
                        }
                    }
                    StatementStatus.FAILED -> item {
                        Text(stringResource(statementAnalysisFailureResource(job.errorCode)), color = MaterialTheme.colorScheme.error)
                    }
                }
                if (state.commitUncertain) item {
                    Text(stringResource(R.string.finance_uncertain))
                    Button(onClick = { scope.launch { controller.resume() } }, enabled = !state.busy) { Text(stringResource(R.string.finance_check_status)) }
                }
                if (!state.busy && !state.commitUncertain && job.status != StatementStatus.COMMITTING) item {
                    OutlinedButton(onClick = {
                        if (job.status in setOf(StatementStatus.COMMITTED, StatementStatus.FAILED) && !state.hasNextPart) controller.newImport()
                        else discardDialog = true
                    }) { Text(stringResource(R.string.finance_new_import)) }
                }
            }
        }
    }
}

@Composable
private fun StatementRowEditor(draft: StatementRowDraft, duplicate: Boolean, editable: Boolean, onChange: (StatementRowDraft) -> Unit) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.finance_row_number, draft.originalIndex + 1), style = MaterialTheme.typography.titleMedium)
            if (duplicate) Text(stringResource(R.string.finance_possible_duplicate), color = MaterialTheme.colorScheme.error)
            CheckRow(draft.included, R.string.finance_include_row, editable) { onChange(draft.copy(included = it)) }
            val enabled = editable && draft.included
            OutlinedTextField(draft.description, { onChange(draft.copy(description = it)) },
                label = { Text(stringResource(R.string.finance_description)) }, enabled = enabled, modifier = Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(draft.occurredOn, { onChange(draft.copy(occurredOn = it)) },
                    label = { Text(stringResource(R.string.finance_date)) }, enabled = enabled, singleLine = true, modifier = Modifier.weight(1f))
                OutlinedTextField(draft.amount, { onChange(draft.copy(amount = it)) },
                    label = { Text(stringResource(R.string.finance_amount)) }, enabled = enabled, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.weight(1f))
            }
            var menuOpen by remember { mutableStateOf(false) }
            Box {
                OutlinedButton(onClick = { menuOpen = true }, enabled = enabled) { Text(stringResource(draft.kind.labelResource())) }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    StatementKind.entries.forEach { kind ->
                        DropdownMenuItem(text = { Text(stringResource(kind.labelResource())) }, onClick = { onChange(draft.copy(kind = kind)); menuOpen = false })
                    }
                }
            }
            OutlinedTextField(draft.category, { onChange(draft.copy(category = it)) },
                label = { Text(stringResource(R.string.finance_category)) }, enabled = enabled, singleLine = true, modifier = Modifier.fillMaxWidth())
            if (draft.included && draft.toRow() == null) Text(stringResource(R.string.finance_invalid_row), color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun CheckRow(checked: Boolean, label: Int, enabled: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(enabled = enabled, role = androidx.compose.ui.semantics.Role.Checkbox) { onChange(!checked) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = checked, onCheckedChange = null, enabled = enabled)
        Text(stringResource(label), Modifier.padding(start = 8.dp))
    }
}

@Composable
private fun ChoiceRow(selected: Boolean, label: Int, enabled: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(enabled = enabled, role = androidx.compose.ui.semantics.Role.RadioButton, onClick = onClick), verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected, onClick = null, enabled = enabled)
        Text(stringResource(label), Modifier.padding(start = 8.dp))
    }
}

private fun StatementKind.labelResource(): Int = when (this) {
    StatementKind.INCOME -> R.string.finance_income
    StatementKind.EXPENSE -> R.string.finance_expense
    StatementKind.TRANSFER -> R.string.finance_transfer
    StatementKind.CARD_PAYMENT -> R.string.finance_card_payment
    StatementKind.UNKNOWN -> R.string.finance_unknown
}

internal fun statementAnalysisFailureResource(errorCode: String?): Int = when (errorCode) {
    "statement_incomplete_split_file" -> R.string.finance_analysis_incomplete
    "statement_csv_invalid" -> R.string.finance_error_csv
    "statement_csv_unsupported_columns" -> R.string.finance_error_csv_columns
    "statement_csv_ambiguous_amount" -> R.string.finance_error_csv_amount
    "statement_csv_invalid_date" -> R.string.finance_error_csv_date
    "statement_csv_too_many_rows" -> R.string.finance_error_csv_batch
    "statement_csv_invalid_encoding" -> R.string.finance_error_csv_encoding
    "statement_csv_unsupported_currency" -> R.string.finance_error_csv_currency
    "statement_format_disabled" -> R.string.finance_error_file
    else -> R.string.finance_analysis_failed
}

private fun StatementFailure.messageResource(): Int = when (this) {
    StatementFailure.FILE_TOO_LARGE -> R.string.finance_error_size
    StatementFailure.INVALID_FILE -> R.string.finance_error_file
    StatementFailure.INVALID_CSV -> R.string.finance_error_csv
    StatementFailure.CSV_BATCH_TOO_LARGE -> R.string.finance_error_csv_batch
    StatementFailure.INVALID_INPUT -> R.string.finance_error_input
    StatementFailure.NOT_CONFIGURED -> R.string.finance_error_configuration
    StatementFailure.UNAUTHENTICATED -> R.string.finance_error_session
    StatementFailure.UNAVAILABLE -> R.string.finance_error_unavailable
    StatementFailure.ROUTE_NOT_FOUND -> R.string.finance_error_route
    StatementFailure.ASSISTANT_UNAVAILABLE -> R.string.finance_error_assistant
    StatementFailure.OFFLINE -> R.string.finance_error_offline
    StatementFailure.TIMEOUT -> R.string.finance_error_timeout
    StatementFailure.CONFLICT -> R.string.finance_error_conflict
    StatementFailure.NOT_FOUND -> R.string.finance_error_not_found
    StatementFailure.UPLOAD_FAILED -> R.string.finance_error_upload
    StatementFailure.MALFORMED_RESPONSE, StatementFailure.BACKEND -> R.string.finance_error_backend
}
