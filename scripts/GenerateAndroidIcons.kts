import java.awt.*
import java.awt.geom.Path2D
import java.awt.image.BufferedImage
import java.io.File
import javax.imageio.ImageIO

fun drawKaspaLogo(g2d: Graphics2D, size: Int) {
    g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
    g2d.color = Color.decode("#70C7BA")

    // Scale factor from 512x512 viewBox to target size
    val scale = size.toDouble() / 512.0
    g2d.scale(scale, scale)

    // Path 1: M86 100H166L286 256L166 412H86L206 256L86 100Z
    val p1 = Path2D.Double().apply {
        moveTo(86.0, 100.0)
        lineTo(166.0, 100.0)
        lineTo(286.0, 256.0)
        lineTo(166.0, 412.0)
        lineTo(86.0, 412.0)
        lineTo(206.0, 256.0)
        closePath()
    }

    // Path 2: M226 100H306L426 256L306 412H226L346 256L226 100Z
    val p2 = Path2D.Double().apply {
        moveTo(226.0, 100.0)
        lineTo(306.0, 100.0)
        lineTo(426.0, 256.0)
        lineTo(306.0, 412.0)
        lineTo(226.0, 412.0)
        lineTo(346.0, 256.0)
        closePath()
    }

    g2d.fill(p1)
    g2d.fill(p2)
}

fun savePng(image: BufferedImage, path: File) {
    path.parentFile?.mkdirs()
    ImageIO.write(image, "png", path)
}

fun main() {
    println("Starting Kotlin Icon & Splash Screen Generator...")

    // 1. Web Icons
    val webSizes = listOf(512, 192, 512)
    val webNames = listOf("kas_icon_512.png", "kas_icon_192.png", "kas_icon.png")
    for (i in webSizes.indices) {
        val size = webSizes[i]
        val img = BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB)
        val g2d = img.createGraphics()
        drawKaspaLogo(g2d, size)
        g2d.dispose()
        savePng(img, File("public/assets/${webNames[i]}"))
    }

    // 2. Android Mipmap Densities
    val densities = mapOf(
        "mdpi" to 48,
        "hdpi" to 72,
        "xhdpi" to 96,
        "xxhdpi" to 144,
        "xxxhdpi" to 192
    )

    val bgColor = Color.decode("#0F172A")

    for ((density, size) in densities) {
        val dir = File("android/app/src/main/res/mipmap-$density")
        dir.mkdirs()

        // Foreground (Transparent)
        val fgImg = BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB)
        val fgG2d = fgImg.createGraphics()
        drawKaspaLogo(fgG2d, size)
        fgG2d.dispose()
        savePng(fgImg, File(dir, "ic_launcher_foreground.png"))

        // Square Launcher (Solid background)
        val sqImg = BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB)
        val sqG2d = sqImg.createGraphics()
        sqG2d.color = bgColor
        sqG2d.fillRect(0, 0, size, size)
        drawKaspaLogo(sqG2d, size)
        sqG2d.dispose()
        savePng(sqImg, File(dir, "ic_launcher.png"))

        // Round Launcher (Circular background)
        val rdImg = BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB)
        val rdG2d = rdImg.createGraphics()
        rdG2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        rdG2d.color = bgColor
        rdG2d.fillOval(0, 0, size, size)
        drawKaspaLogo(rdG2d, size)
        rdG2d.dispose()
        savePng(rdImg, File(dir, "ic_launcher_round.png"))
    }

    // 3. Splash Screens
    // Portrait
    val portW = 480
    val portH = 800
    val portImg = BufferedImage(portW, portH, BufferedImage.TYPE_INT_ARGB)
    val portG2d = portImg.createGraphics()
    portG2d.color = bgColor
    portG2d.fillRect(0, 0, portW, portH)
    portG2d.translate((portW - 200) / 2, (portH - 200) / 2)
    drawKaspaLogo(portG2d, 200)
    portG2d.dispose()
    File("android/app/src/main/res/drawable").mkdirs()
    savePng(portImg, File("android/app/src/main/res/drawable/splash.png"))

    // Landscape HDPI
    val landW = 800
    val landH = 480
    val landImg = BufferedImage(landW, landH, BufferedImage.TYPE_INT_ARGB)
    val landG2d = landImg.createGraphics()
    landG2d.color = bgColor
    landG2d.fillRect(0, 0, landW, landH)
    landG2d.translate((landW - 160) / 2, (landH - 160) / 2)
    drawKaspaLogo(landG2d, 160)
    landG2d.dispose()
    File("android/app/src/main/res/drawable-land-hdpi").mkdirs()
    savePng(landImg, File("android/app/src/main/res/drawable-land-hdpi/splash.png"))

    println("All Android & Web icons and splash screens successfully generated via Kotlin!")
}

main()
