package com.rinassistant.android.rin.overlay.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.annotation.DrawableRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.IntSize

/** Removes transparent bottom padding at draw time; the original image files stay intact. */
@Composable
internal fun rememberBottomAlignedAvatarPainter(@DrawableRes resource: Int, remote: Bitmap?): Painter {
    val resources = LocalContext.current.resources
    val painter = remember(resources, resource, remote) {
        val bitmap = remote ?: BitmapFactory.decodeResource(resources, resource)
        bitmap?.let {
            BitmapPainter(it.asImageBitmap(), srcSize = IntSize(it.width, visibleAvatarHeight(it)))
        }
    }
    return painter ?: painterResource(resource)
}

private fun visibleAvatarHeight(bitmap: Bitmap): Int {
    if (!bitmap.hasAlpha()) return bitmap.height
    val row = IntArray(bitmap.width)
    for (y in bitmap.height - 1 downTo 0) {
        bitmap.getPixels(row, 0, bitmap.width, 0, y, bitmap.width, 1)
        if (row.any { (it ushr 24) > 16 }) return y + 1
    }
    return bitmap.height
}
