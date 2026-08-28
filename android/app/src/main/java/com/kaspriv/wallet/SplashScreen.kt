package com.kaspriv.wallet.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * 1:1 Kotlin Jetpack Compose port of src/components/SplashScreen.tsx
 *
 * Matches exact CSS tokens:
 * - Background: bg-[#090D12]
 * - Glow: bg-[#70C7BA]/20 rounded-full blur-xl animate-pulse (w-24 h-24)
 * - Icon: viewBox="0 0 100 100", strokeWidth=8, strokeLinecap="round", strokeLinejoin="round" (w-20 h-20)
 * - Subtitle: mt-6 text-sm font-semibold tracking-wider text-slate-400 uppercase ("Kaspa Private Vault")
 * - Transition: duration=0.5s fade out
 */

val SplashBackground = Color(0xFF090D12)
val SplashKaspaTeal = Color(0xFF70C7BA)
val SplashSlate400 = Color(0xFF94A3B8)

@Composable
fun SplashScreen(
    visible: Boolean = true,
    modifier: Modifier = Modifier
) {
    AnimatedVisibility(
        visible = visible,
        exit = fadeOut(animationSpec = tween(durationMillis = 500))
    ) {
        // Tailwind CSS standard pulse timing: 2s cubic-bezier(0.4, 0, 0.6, 1) infinite
        val infiniteTransition = rememberInfiniteTransition(label = "tailwindPulse")
        val pulseOpacity by infiniteTransition.animateFloat(
            initialValue = 1.0f,
            targetValue = 0.5f,
            animationSpec = infiniteRepeatable(
                animation = tween(
                    durationMillis = 1000,
                    easing = CubicBezierEasing(0.4f, 0.0f, 0.6f, 1.0f)
                ),
                repeatMode = RepeatMode.Reverse
            ),
            label = "pulseOpacity"
        )

        Box(
            modifier = modifier
                .fillMaxSize()
                .background(SplashBackground),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                // Centered Relative Icon + Glow Container
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.size(96.dp) // w-24 h-24
                ) {
                    // Radial blur glow layer (bg-[#70C7BA]/20 blur-xl)
                    Canvas(
                        modifier = Modifier
                            .size(96.dp)
                            .graphicsLayer {
                                alpha = pulseOpacity
                            }
                    ) {
                        drawCircle(
                            brush = Brush.radialGradient(
                                colors = listOf(
                                    SplashKaspaTeal.copy(alpha = 0.35f),
                                    SplashKaspaTeal.copy(alpha = 0.15f),
                                    Color.Transparent
                                )
                            ),
                            radius = size.width / 1.5f
                        )
                    }

                    // Kaspa Stylized Logo (w-20 h-20, strokeWidth 8, strokeLinecap round)
                    Canvas(
                        modifier = Modifier
                            .size(80.dp) // w-20 h-20
                            .graphicsLayer {
                                alpha = pulseOpacity
                            }
                    ) {
                        val w = size.width
                        val h = size.height
                        // 8/100 of container size = 8% stroke width
                        val strokePx = w * 0.08f

                        // Vertical Stem: M 30 20 L 30 80
                        val verticalStem = Path().apply {
                            moveTo(w * 0.30f, h * 0.20f)
                            lineTo(w * 0.30f, h * 0.80f)
                        }
                        drawPath(
                            path = verticalStem,
                            color = SplashKaspaTeal,
                            style = Stroke(
                                width = strokePx,
                                cap = StrokeCap.Round,
                                join = StrokeJoin.Round
                            )
                        )

                        // Outer Chevron: M 70 30 L 45 50 L 70 70
                        val outerChevron = Path().apply {
                            moveTo(w * 0.70f, h * 0.30f)
                            lineTo(w * 0.45f, h * 0.50f)
                            lineTo(w * 0.70f, h * 0.70f)
                        }
                        drawPath(
                            path = outerChevron,
                            color = SplashKaspaTeal,
                            style = Stroke(
                                width = strokePx,
                                cap = StrokeCap.Round,
                                join = StrokeJoin.Round
                            )
                        )

                        // Inner Chevron with 0.6 opacity: M 50 35 L 35 50 L 50 65
                        val innerChevron = Path().apply {
                            moveTo(w * 0.50f, h * 0.35f)
                            lineTo(w * 0.35f, h * 0.50f)
                            lineTo(w * 0.50f, h * 0.65f)
                        }
                        drawPath(
                            path = innerChevron,
                            color = SplashKaspaTeal.copy(alpha = 0.6f),
                            style = Stroke(
                                width = strokePx,
                                cap = StrokeCap.Round,
                                join = StrokeJoin.Round
                            )
                        )
                    }
                }

                // Spacing: mt-6 (24dp)
                Spacer(modifier = Modifier.height(24.dp))

                // Text: mt-6 text-sm font-semibold tracking-wider text-slate-400 uppercase
                Text(
                    text = "KASPA PRIVATE VAULT",
                    color = SplashSlate400,
                    fontSize = 14.sp, // text-sm
                    fontWeight = FontWeight.SemiBold, // font-semibold
                    letterSpacing = 1.4.sp, // tracking-wider
                    fontFamily = FontFamily.SansSerif
                )
            }
        }
    }
}

@Preview
@Composable
fun SplashScreenPreview() {
    SplashScreen()
}
