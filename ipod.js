/* Monta o tocador portátil (mini e grande) e controla a roda de clique */

function estiloDaCapa(capa) {
    return capa ? `background-image: url(&quot;${escapar(capa)}&quot;)` : ""
}

/* Aparelho pequeno usado nos cards (só spans, porque fica dentro de um <button>) */
function ipodMiniHTML(capa = null) {
    return `
        <span class="ipod ipod-mini">
            <span class="ipod-tela">
                <span class="ipod-capa${capa ? " com-capa" : ""}" style="${estiloDaCapa(capa)}">
                    <span class="ipod-nota">♪</span>
                    <span class="ipod-ondas"><i></i><i></i><i></i></span>
                </span>
                <span class="ipod-mini-progresso"><span></span></span>
            </span>
            <span class="ipod-roda"><span class="ipod-roda-luz"></span><span class="ipod-centro"></span></span>
        </span>
    `
}

/* Aparelho grande: tela "tocando agora" + roda com teclas de verdade */
function ipodGrandeHTML({ rotuloMenu = "Minimizar", rotuloAnterior = "Música anterior", rotuloProxima = "Próxima música" } = {}) {
    return `
        <div class="ipod ipod-grande">
            <div class="ipod-tela">
                <div class="ipod-barra-status">
                    <span class="ipod-estado">Tocando agora</span>
                    <span class="ipod-bateria" aria-hidden="true"></span>
                </div>
                <div class="ipod-agora">
                    <div class="ipod-capa" aria-hidden="true">
                        <span class="ipod-nota">♪</span>
                        <span class="ipod-ondas"><i></i><i></i><i></i></span>
                    </div>
                    <div class="ipod-textos">
                        <p class="ipod-titulo"></p>
                        <p class="ipod-artista"></p>
                        <p class="ipod-detalhes"></p>
                    </div>
                </div>
                <div class="ipod-progresso">
                    <div class="ipod-trilho"><span></span></div>
                    <div class="ipod-tempos"><span class="ipod-tempo">0:00</span><span class="ipod-restante">-0:30</span></div>
                </div>
            </div>

            <div class="ipod-roda">
                <span class="ipod-roda-luz"></span>
                <button class="ipod-tecla ipod-tecla-menu" data-acao="menu" aria-label="${rotuloMenu}">MENU</button>
                <button class="ipod-tecla ipod-tecla-anterior" data-acao="anterior" aria-label="${rotuloAnterior}">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h2.4v14H5zM20 5v14l-11-7z"/></svg>
                </button>
                <button class="ipod-tecla ipod-tecla-proxima" data-acao="proxima" aria-label="${rotuloProxima}">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.6 5H19v14h-2.4zM4 5v14l11-7z"/></svg>
                </button>
                <button class="ipod-tecla ipod-tecla-tocar" data-acao="tocar" aria-label="Tocar ou pausar">
                    <svg viewBox="0 0 32 24" aria-hidden="true"><path d="M2 5v14l10-7zM17 5h3v14h-3zM24 5h3v14h-3z"/></svg>
                </button>
                <button class="ipod-centro" data-acao="tocar" aria-label="Tocar"></button>
            </div>
        </div>
    `
}

/* Liga os botões e o giro da roda. "acoes" recebe: tocar, menu, anterior, proxima, girar(graus) */
function criarIpod(container, acoes = {}) {
    const ipod = container.querySelector(".ipod")
    const capa = ipod.querySelector(".ipod-capa")
    const agora = ipod.querySelector(".ipod-agora")
    const titulo = ipod.querySelector(".ipod-titulo")
    const artista = ipod.querySelector(".ipod-artista")
    const detalhes = ipod.querySelector(".ipod-detalhes")
    const estado = ipod.querySelector(".ipod-estado")
    const barra = ipod.querySelector(".ipod-trilho span")
    const tempo = ipod.querySelector(".ipod-tempo")
    const restante = ipod.querySelector(".ipod-restante")
    const roda = ipod.querySelector(".ipod-roda")
    const luz = ipod.querySelector(".ipod-roda-luz")
    const centro = ipod.querySelector(".ipod-centro")

    /* Cliques nas teclas */
    ipod.addEventListener("click", (evento) => {
        const tecla = evento.target.closest("[data-acao]")
        if (tecla && ipod.contains(tecla)) acoes[tecla.dataset.acao]?.()
    })

    /* Girar a roda com mouse ou dedo */
    let apertado = false
    let girou = false
    let anguloAnterior = 0
    let acumulado = 0

    function anguloDoPonteiro(evento) {
        const caixa = roda.getBoundingClientRect()
        const x = evento.clientX - (caixa.left + caixa.width / 2)
        const y = evento.clientY - (caixa.top + caixa.height / 2)
        return { angulo: Math.atan2(y, x) * 180 / Math.PI, distancia: Math.hypot(x, y) / (caixa.width / 2) }
    }

    roda.addEventListener("pointerdown", (evento) => {
        if (evento.target.closest(".ipod-centro")) return
        const { angulo, distancia } = anguloDoPonteiro(evento)
        if (distancia < 0.36 || distancia > 1) return

        apertado = true
        girou = false
        acumulado = 0
        anguloAnterior = angulo
        roda._pointerId = evento.pointerId
    })

    roda.addEventListener("pointermove", (evento) => {
        if (!apertado) return

        const { angulo } = anguloDoPonteiro(evento)
        let diferenca = angulo - anguloAnterior
        if (diferenca > 180) diferenca -= 360
        if (diferenca < -180) diferenca += 360
        anguloAnterior = angulo
        acumulado += diferenca

        if (!girou && Math.abs(acumulado) > 10) {
            girou = true
            ipod.classList.add("girando")
            try { roda.setPointerCapture(roda._pointerId) } catch {}
        }

        if (girou) {
            luz.style.setProperty("--angulo", `${angulo + 90}deg`)
            acoes.girar?.(diferenca)
        }
    })

    function soltar() {
        apertado = false
        ipod.classList.remove("girando")
    }

    roda.addEventListener("pointerup", soltar)
    roda.addEventListener("pointercancel", soltar)

    /* Depois de girar, o clique que vem junto não deve acionar a tecla */
    roda.addEventListener("click", (evento) => {
        if (girou) {
            evento.stopPropagation()
            evento.preventDefault()
            girou = false
        }
    }, true)

    function preencher(elemento, valor, textoVazio) {
        const texto = String(valor ?? "").trim()
        elemento.textContent = texto || textoVazio
        elemento.classList.toggle("vazio", !texto)
    }

    return {
        elemento: ipod,
        centro,

        mostrar({ titulo: novoTitulo, artista: novoArtista, detalhes: novosDetalhes, capa: novaCapa, matiz }) {
            preencher(titulo, novoTitulo, "Título da música")
            preencher(artista, novoArtista, "Artista")
            preencher(detalhes, novosDetalhes, "Gênero · Ano · Duração")
            if (matiz !== undefined) ipod.style.setProperty("--matiz", matiz)
            this.capa(novaCapa)
        },

        capa(novaCapa) {
            const atual = capa.dataset.capa || ""
            if ((novaCapa || "") === atual) return
            capa.dataset.capa = novaCapa || ""
            capa.classList.toggle("com-capa", Boolean(novaCapa))
            capa.style.backgroundImage = novaCapa ? `url("${novaCapa}")` : ""
        },

        trocar() {
            agora.classList.remove("trocando")
            void agora.offsetWidth
            agora.classList.add("trocando")
        },

        estado(texto) {
            estado.textContent = texto
        },

        progresso(atual, total) {
            const fracao = total > 0 ? Math.min(atual / total, 1) : 0
            barra.style.width = `${fracao * 100}%`
            tempo.textContent = formatarTempo(atual)
            restante.textContent = `-${formatarTempo(Math.max(total - atual, 0))}`
        },

        tocando(sim) {
            ipod.classList.toggle("tocando", sim)
            centro.setAttribute("aria-label", sim ? "Pausar" : "Tocar")
        },

        buscando(sim) {
            ipod.classList.toggle("buscando", sim)
        }
    }
}
