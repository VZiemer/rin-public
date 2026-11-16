package com.rinassistant.android.rin.assistant

import android.content.Context
import android.text.Editable
import android.text.TextWatcher
import android.text.InputType
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import com.rinassistant.android.R

class AssistantInputView(
    context: Context,
    private val controller: AssistantInputController,
    onSend: () -> Unit,
    private val displayName: String = "Rin",
) : LinearLayout(context) {
    private val input = EditText(context).apply {
        hint = context.getString(R.string.assistant_input_hint, displayName)
        contentDescription = context.getString(R.string.assistant_input_hint, displayName)
        inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or InputType.TYPE_TEXT_FLAG_MULTI_LINE
        setHorizontallyScrolling(false)
        maxLines = 3
        imeOptions = EditorInfo.IME_ACTION_SEND
        setText(controller.state.value.text)
        addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { controller.edit(s.toString()) }
            override fun afterTextChanged(s: Editable?) = Unit
        })
        setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_SEND) { onSend(); true } else false
        }
        setOnKeyListener { _, keyCode, event ->
            if (keyCode == android.view.KeyEvent.KEYCODE_ENTER && !event.isShiftPressed) {
                if (event.action == android.view.KeyEvent.ACTION_UP) onSend()
                true
            } else false
        }
    }
    private val send = Button(context).apply {
        setText(R.string.assistant_send)
        setOnClickListener { onSend() }
    }
    init {
        orientation = HORIZONTAL
        setBackgroundColor(android.graphics.Color.WHITE)
        input.setTextColor(android.graphics.Color.BLACK)
        input.setHintTextColor(android.graphics.Color.DKGRAY)
        addView(input, LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
        addView(send)
    }
    fun render(state: AssistantInputState) {
        send.text = if (state.isThinking) context.getString(R.string.assistant_thinking, displayName) else context.getString(R.string.assistant_send)
        send.contentDescription = send.text
        if (input.text.toString() != state.text) { input.setText(state.text); input.setSelection(state.text.length) }
        input.isEnabled = !state.submitting
        send.isEnabled = !state.submitting && state.text.isNotBlank()
        input.error = if (state.failed) {
            when (state.failure) {
                com.rinassistant.android.rin.agent.AgentFailure.NOT_CONFIGURED ->
                    context.getString(R.string.assistant_agent_unavailable, displayName)
                com.rinassistant.android.rin.agent.AgentFailure.ASSISTANT_NOT_FOUND ->
                    context.getString(R.string.assistant_not_found, displayName)
                com.rinassistant.android.rin.agent.AgentFailure.UNAUTHENTICATED ->
                    context.getString(R.string.auth_required)
                else -> context.getString(R.string.assistant_action_failed)
            }
        } else null
    }
}
