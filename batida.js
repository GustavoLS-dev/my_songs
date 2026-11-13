/* Fundo que reage à batida da música.
   Usa a Web Audio API para "ouvir" o <audio> da prévia e desenha num <canvas> atrás do site:
   ondas de espectro no rodapé, anéis de luz a cada batida e as luzes ambiente pulsando nos graves. */

function criarFundoReativo(audio, obterMatiz = () => 255) {
    const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const raiz = document.documentElement

    /* Precisa vir antes de qualquer src: o iTunes libera CORS, então a análise funciona */
    audio.crossOrigin = "anonymous"

    const canvas = document.createElement("canvas")
    canvas.className = "fundo-batida"
    canvas.setAttribute("aria-hidden", "true")
    ;(document.querySelector(".ambiente") || document.body).appendChild(canvas)
    const pincel = canvas.getContext("2d")

    const totalDeBandas = 40
    const bandas = new Float32Array(totalDeBandas)

    let contexto = null
    let analisador = null
    let dados = null
    let quadro = null
    let intensidade = 0
    let grave = 0
    let mediaDoGrave = 0
    let pulso = 0
    let ultimaBatida = 0
    let aneis = []
    let largura = 0
    let altura = 0

    function redimensionar() {
        const escala = Math.min(window.devicePixelRatio || 1, 1.5)
        const novaLargura = Math.round(window.innerWidth * escala)
        const novaAltura = Math.round(window.innerHeight * escala)
        if (novaLargura !== canvas.width || novaAltura !== canvas.height) {
            canvas.width = novaLargura
            canvas.height = novaAltura
        }
        largura = canvas.width
        altura = canvas.height
    }

    /* Liga a análise. Chame dentro de um clique (os navegadores exigem um gesto para o áudio) */
    const ehIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

    function ligar() {
        if (reduzirMovimento) return

        /* iOS antigo (sem audioSession) silenciaria a prévia no modo silencioso: melhor sem efeito do que sem som */
        if (ehIOS && !navigator.audioSession) return

        try {
            if (!contexto) {
                const Contexto = window.AudioContext || window.webkitAudioContext
                if (!Contexto) return

                /* iPhone: sem isso, o som que passa pela análise fica mudo no modo silencioso (iOS 17+) */
                try {
                    if (navigator.audioSession) navigator.audioSession.type = "playback"
                } catch {}

                contexto = new Contexto()
                const fonte = contexto.createMediaElementSource(audio)
                analisador = contexto.createAnalyser()
                analisador.fftSize = 1024
                analisador.smoothingTimeConstant = 0.6
                fonte.connect(analisador)
                analisador.connect(contexto.destination)
                dados = new Uint8Array(analisador.frequencyBinCount)
            }

            if (contexto.state === "suspended") contexto.resume()
            iniciar()
        } catch {}
    }

    function iniciar() {
        if (!quadro && !reduzirMovimento) quadro = requestAnimationFrame(desenhar)
    }

    /* Se o som voltar a tocar por outro caminho (teclado, fim da prévia), garante o contexto ativo */
    audio.addEventListener("play", () => {
        if (contexto?.state === "suspended") contexto.resume()
        iniciar()
    })

    function lerFrequencias() {
        analisador.getByteFrequencyData(dados)

        /* Graves: ~40 a 170 Hz */
        let somaGrave = 0
        for (let i = 1; i <= 4; i++) somaGrave += dados[i]
        const graveAgora = somaGrave / (4 * 255)
        grave += (graveAgora - grave) * 0.35

        /* Bandas em escala logarítmica (como o ouvido escuta) */
        const primeira = 2
        const ultima = Math.min(dados.length - 1, 280)
        for (let b = 0; b < totalDeBandas; b++) {
            const inicio = Math.floor(primeira * Math.pow(ultima / primeira, b / totalDeBandas))
            const fim = Math.max(inicio + 1, Math.floor(primeira * Math.pow(ultima / primeira, (b + 1) / totalDeBandas)))
            let soma = 0
            for (let i = inicio; i < fim; i++) soma += dados[i]
            const valor = soma / ((fim - inicio) * 255)
            bandas[b] += (valor - bandas[b]) * 0.3
        }

        return graveAgora
    }

    /* Batida = subida rápida do grave em relação ao nível recente (o "ataque" do bumbo) */
    function detectarBatida(graveAgora, agora) {
        const subida = graveAgora - mediaDoGrave
        mediaDoGrave = mediaDoGrave * 0.9 + graveAgora * 0.1

        if (graveAgora > 0.3 && subida > 0.1 && agora - ultimaBatida > 260) {
            ultimaBatida = agora
            pulso = 1
            aneis.push({ inicio: agora, forca: Math.min(1, graveAgora * 1.2) })
            if (aneis.length > 6) aneis.shift()
        }
    }

    function desenharOnda(matiz, escala, deslocamento, transparencia) {
        /* Graves no centro, agudos nas pontas: espelha as bandas */
        const pontos = []
        const total = totalDeBandas * 2
        for (let i = 0; i < total; i++) {
            const banda = i < totalDeBandas ? totalDeBandas - 1 - i : i - totalDeBandas
            pontos.push(bandas[banda])
        }

        const alturaMaxima = altura * 0.32 * escala * intensidade
        const passo = largura / (total - 1)

        pincel.beginPath()
        pincel.moveTo(0, altura)
        pincel.lineTo(0, altura - pontos[0] * alturaMaxima)

        for (let i = 1; i < total; i++) {
            const xAnterior = (i - 1) * passo
            const yAnterior = altura - pontos[i - 1] * alturaMaxima - deslocamento
            const x = i * passo
            const y = altura - pontos[i] * alturaMaxima - deslocamento
            pincel.quadraticCurveTo(xAnterior, yAnterior, (xAnterior + x) / 2, (yAnterior + y) / 2)
        }

        pincel.lineTo(largura, altura)
        pincel.closePath()

        const gradiente = pincel.createLinearGradient(0, altura, 0, altura - alturaMaxima - deslocamento)
        gradiente.addColorStop(0, `hsla(${matiz}, 90%, 60%, ${transparencia})`)
        gradiente.addColorStop(1, `hsla(${matiz}, 90%, 60%, 0)`)
        pincel.fillStyle = gradiente
        pincel.fill()
    }

    function desenhar(agora) {
        quadro = null
        redimensionar()

        const tocando = Boolean(contexto) && !audio.paused && !audio.ended
        intensidade += ((tocando ? 1 : 0) - intensidade) * 0.05

        if (tocando && analisador) {
            detectarBatida(lerFrequencias(), agora)
        } else {
            grave *= 0.9
            for (let b = 0; b < totalDeBandas; b++) bandas[b] *= 0.9
        }

        pulso *= 0.9

        const matiz = Number(obterMatiz()) || 255
        const nivel = Math.min(1, grave * intensidade)
        raiz.style.setProperty("--grave", nivel.toFixed(3))
        raiz.style.setProperty("--batida", (pulso * intensidade).toFixed(3))

        pincel.clearRect(0, 0, largura, altura)
        pincel.globalCompositeOperation = "lighter"

        /* Brilho geral que respira com o grave */
        const raio = Math.max(largura, altura) * 0.6
        const brilho = pincel.createRadialGradient(largura / 2, altura * 0.45, 0, largura / 2, altura * 0.45, raio)
        brilho.addColorStop(0, `hsla(${matiz}, 85%, 55%, ${(0.06 + nivel * 0.16 + pulso * 0.1) * intensidade})`)
        brilho.addColorStop(1, `hsla(${matiz}, 85%, 55%, 0)`)
        pincel.fillStyle = brilho
        pincel.fillRect(0, 0, largura, altura)

        /* Anéis de luz a cada batida */
        const maiorLado = Math.max(largura, altura)
        aneis = aneis.filter((anel) => {
            const progresso = (agora - anel.inicio) / 1500
            if (progresso >= 1) return false

            const suave = 1 - Math.pow(1 - progresso, 3)
            pincel.beginPath()
            pincel.arc(largura / 2, altura * 0.45, 30 + suave * maiorLado * 0.55, 0, Math.PI * 2)
            pincel.strokeStyle = `hsla(${matiz + 25}, 95%, 70%, ${(1 - progresso) * 0.32 * anel.forca * intensidade})`
            pincel.lineWidth = (2 + (1 - progresso) * 10) * (largura / window.innerWidth)
            pincel.stroke()
            return true
        })

        /* Ondas do espectro no rodapé */
        desenharOnda(matiz, 1, 0, 0.42)
        desenharOnda(matiz + 50, 0.7, altura * 0.01, 0.3)

        pincel.globalCompositeOperation = "source-over"

        if (tocando || intensidade > 0.01 || aneis.length > 0) {
            quadro = requestAnimationFrame(desenhar)
        } else {
            pincel.clearRect(0, 0, largura, altura)
            raiz.style.setProperty("--grave", "0")
            raiz.style.setProperty("--batida", "0")
        }
    }

    return { ligar }
}
