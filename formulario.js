/* Tudo o que as páginas de cadastrar e editar têm em comum:
   toasts, transição entre páginas, validação, prévia ao vivo e o assistente do iTunes */

const formulario = (() => {
    const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const campoTitulo = document.getElementById("titulo")
    const campoArtista = document.getElementById("artista")
    const campoGenero = document.getElementById("genero")
    const campoAno = document.getElementById("ano")
    const campoDuracao = document.getElementById("duracao")
    const todosOsCampos = [campoTitulo, campoArtista, campoGenero, campoAno, campoDuracao]

    /* ---------- Toasts ---------- */

    function mostrarToast(mensagem, tipo = "sucesso") {
        const toasts = document.getElementById("toasts")
        const toast = document.createElement("div")
        const icone = tipo === "erro"
            ? '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/></svg>'
            : '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'

        toast.className = `toast toast-${tipo}`
        toast.setAttribute("role", tipo === "erro" ? "alert" : "status")
        toast.innerHTML = `<span class="toast-icone">${icone}</span><span></span>`
        toast.lastElementChild.textContent = mensagem
        toasts.appendChild(toast)

        setTimeout(() => {
            toast.classList.add("saindo")
            setTimeout(() => toast.remove(), reduzirMovimento ? 0 : 300)
        }, 3400)
    }

    /* ---------- Transição entre páginas ---------- */

    function irPara(endereco) {
        document.body.classList.add("saindo")
        setTimeout(() => { window.location.href = endereco }, reduzirMovimento ? 0 : 180)
    }

    document.addEventListener("click", (evento) => {
        const link = evento.target.closest("a[href]")
        if (!link || evento.defaultPrevented || evento.button !== 0) return
        if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey || link.target) return

        const destino = new URL(link.href, window.location.href)
        if (destino.origin !== window.location.origin || destino.href === window.location.href) return

        evento.preventDefault()
        irPara(destino.href)
    })

    window.addEventListener("pageshow", () => document.body.classList.remove("saindo"))

    /* ---------- Prévia: o aparelho ---------- */

    const previa = document.getElementById("previa")
    const previaAparelho = document.getElementById("previaAparelho")
    const previaStatus = document.getElementById("previaStatus")

    previaAparelho.innerHTML = ipodGrandeHTML({
        rotuloMenu: "Parar a prévia",
        rotuloAnterior: "Voltar 5 segundos",
        rotuloProxima: "Avançar 5 segundos"
    })

    const audio = new Audio()
    let faixaAtual = null

    const aparelho = criarIpod(previaAparelho, {
        tocar: alternarPrevia,
        menu: pararPrevia,
        anterior: () => avancar(-5),
        proxima: () => avancar(5),
        girar: (graus) => avancar((graus / 360) * 15)
    })

    function detalhesDosCampos() {
        return [campoGenero.value.trim(), campoAno.value, campoDuracao.value ? `${campoDuracao.value} min` : ""]
            .filter(Boolean)
            .join(" · ")
    }

    function atualizarPrevia() {
        const matiz = matizDoGenero(campoGenero.value)
        aparelho.mostrar({
            titulo: campoTitulo.value,
            artista: campoArtista.value,
            detalhes: detalhesDosCampos(),
            capa: capaDaFaixa(faixaAtual),
            matiz
        })
        document.documentElement.style.setProperty("--matiz", matiz)
    }

    /* ---------- Validação ---------- */

    function marcarCampo(input, mensagem) {
        const campo = input.closest(".campo")
        const erro = document.getElementById(`erro-${input.id}`)

        campo.classList.toggle("invalido", Boolean(mensagem))
        input.setAttribute("aria-invalid", mensagem ? "true" : "false")
        erro.textContent = mensagem

        if (mensagem && !reduzirMovimento) {
            campo.classList.remove("tremer")
            void campo.offsetWidth
            campo.classList.add("tremer")
        }
    }

    function validar() {
        const vazios = todosOsCampos.filter((input) => input.value.trim() === "")
        todosOsCampos.forEach((input) => marcarCampo(input, vazios.includes(input) ? "Preencha este campo" : ""))

        if (vazios.length > 0) {
            vazios[0].focus()
            return false
        }
        return true
    }

    function estadoBotao(botao, estado, texto) {
        botao.classList.remove("carregando", "sucesso")
        if (estado) botao.classList.add(estado)
        botao.disabled = estado === "carregando" || estado === "sucesso"
        botao.setAttribute("aria-busy", estado === "carregando" ? "true" : "false")
        botao.querySelector(".rotulo").textContent = texto
    }

    /* ---------- Prévia de áudio (iTunes) ---------- */

    function atualizarEstadoAudio() {
        const tocando = Boolean(faixaAtual) && !audio.paused
        aparelho.tocando(tocando)
        previa.classList.toggle("tocando", tocando)

        if (faixaAtual) {
            aparelho.estado(audio.ended ? "Prévia terminada" : tocando ? "Tocando agora" : "Prévia pronta")
        } else if (!aparelho.elemento.classList.contains("buscando")) {
            aparelho.estado("Sem prévia")
        }
    }

    function mostrarProgresso() {
        const total = Number.isFinite(audio.duration) ? audio.duration : 30
        aparelho.progresso(audio.currentTime || 0, total)
    }

    function avancar(segundos) {
        if (!faixaAtual || !Number.isFinite(audio.duration)) return
        audio.currentTime = Math.min(Math.max(audio.currentTime + segundos, 0), audio.duration)
        mostrarProgresso()
    }

    function alternarPrevia() {
        if (!faixaAtual) return

        if (!audio.paused) {
            audio.pause()
            return
        }

        if (audio.src !== faixaAtual.previewUrl) audio.src = faixaAtual.previewUrl
        if (audio.ended) audio.currentTime = 0
        audio.play().catch(() => mostrarToast("Não foi possível tocar a prévia.", "erro"))
    }

    function pararPrevia() {
        audio.pause()
        audio.removeAttribute("src")
        audio.load()
        aparelho.progresso(0, 30)
        atualizarEstadoAudio()
    }

    function definirFaixa(faixa, mensagem) {
        aparelho.buscando(false)

        if (faixa && faixaAtual && faixa.previewUrl === faixaAtual.previewUrl) {
            atualizarEstadoAudio()
            return
        }

        faixaAtual = faixa
        pararPrevia()
        aparelho.capa(capaDaFaixa(faixa))
        previa.classList.toggle("com-previa", Boolean(faixa))
        previaStatus.textContent = faixa ? `${faixa.trackName} — ${faixa.artistName}` : mensagem
    }

    audio.addEventListener("play", atualizarEstadoAudio)
    audio.addEventListener("pause", atualizarEstadoAudio)
    audio.addEventListener("ended", atualizarEstadoAudio)
    audio.addEventListener("timeupdate", mostrarProgresso)

    /* ---------- Sugestões do iTunes ---------- */

    const sugestoes = document.getElementById("sugestoes")
    const statusBusca = document.querySelector(".busca-itunes")
    let listaSugestoes = []
    let ativa = -1
    let temporizador = null
    let pedidoAtual = 0

    function fecharSugestoes() {
        sugestoes.hidden = true
        sugestoes.innerHTML = ""
        listaSugestoes = []
        ativa = -1
        campoTitulo.setAttribute("aria-expanded", "false")
        campoTitulo.removeAttribute("aria-activedescendant")
    }

    function marcarAtiva(indice) {
        const itens = sugestoes.querySelectorAll(".sugestao")
        if (itens.length === 0) return

        ativa = (indice + itens.length) % itens.length
        itens.forEach((item, posicao) => item.setAttribute("aria-selected", posicao === ativa ? "true" : "false"))
        campoTitulo.setAttribute("aria-activedescendant", itens[ativa].id)
        itens[ativa].scrollIntoView({ block: "nearest" })
    }

    function mostrarSugestoes(faixas) {
        listaSugestoes = faixas.slice(0, 6)

        if (listaSugestoes.length === 0) {
            fecharSugestoes()
            return
        }

        sugestoes.innerHTML = listaSugestoes.map((faixa, indice) => {
            const dados = dadosDaFaixa(faixa)
            return `
                <li class="sugestao" id="sugestao-${indice}" role="option" aria-selected="false" data-indice="${indice}" style="--matiz: ${matizDoGenero(faixa.primaryGenreName)}; --i: ${indice}">
                    <span class="sugestao-capa" style="${estiloDaCapa(capaDaFaixa(faixa))}" aria-hidden="true"></span>
                    <span class="sugestao-texto">
                        <span class="sugestao-titulo">${escapar(faixa.trackName)}</span>
                        <span class="sugestao-detalhes">${escapar(faixa.artistName)} · ${escapar(dados.ano)} · ${escapar(dados.genero)}</span>
                    </span>
                    <span class="sugestao-duracao">${formatarTempo((faixa.trackTimeMillis || 0) / 1000)}</span>
                </li>
            `
        }).join("")

        sugestoes.hidden = false
        campoTitulo.setAttribute("aria-expanded", "true")
        ativa = -1
    }

    function escolherSugestao(indice) {
        const faixa = listaSugestoes[indice]
        if (!faixa) return

        const dados = dadosDaFaixa(faixa)
        campoTitulo.value = dados.titulo
        campoArtista.value = dados.artista
        campoGenero.value = dados.genero
        campoAno.value = dados.ano
        campoDuracao.value = dados.duracao

        todosOsCampos.forEach((input) => {
            marcarCampo(input, "")
            const campo = input.closest(".campo")
            campo.classList.remove("preenchido")
            void campo.offsetWidth
            campo.classList.add("preenchido")
        })

        clearTimeout(temporizador)
        pedidoAtual++
        statusBusca.classList.remove("buscando")
        fecharSugestoes()
        atualizarPrevia()
        definirFaixa(faixa)
    }

    async function buscarNoItunes({ comSugestoes }) {
        const titulo = campoTitulo.value.trim()
        const artista = campoArtista.value.trim()
        const pedido = ++pedidoAtual

        statusBusca.classList.add("buscando")
        if (!faixaAtual) {
            aparelho.buscando(true)
            aparelho.estado("Procurando…")
            previaStatus.textContent = "Procurando no iTunes…"
        }

        try {
            const resultados = await pesquisarItunes(`${titulo} ${artista}`)
            if (pedido !== pedidoAtual) return

            if (comSugestoes && document.activeElement === campoTitulo) {
                mostrarSugestoes(resultados)
            }

            if (!artista) {
                definirFaixa(null, "Escolha uma sugestão ou digite o artista")
            } else {
                const faixa = escolherFaixa(resultados, { titulo, artista })
                definirFaixa(faixa, "Nenhuma prévia encontrada para essa música")
            }
        } catch {
            if (pedido !== pedidoAtual) return
            definirFaixa(null, "iTunes indisponível no momento")
        } finally {
            if (pedido === pedidoAtual) statusBusca.classList.remove("buscando")
        }
    }

    function agendarBusca(comSugestoes) {
        clearTimeout(temporizador)

        if (campoTitulo.value.trim().length < 2) {
            pedidoAtual++
            statusBusca.classList.remove("buscando")
            fecharSugestoes()
            definirFaixa(null, "Digite o título para buscar")
            return
        }

        temporizador = setTimeout(() => buscarNoItunes({ comSugestoes }), 350)
    }

    /* Teclado nas sugestões (registrado antes do Enter que envia o formulário) */
    campoTitulo.addEventListener("keydown", (evento) => {
        if (sugestoes.hidden) return

        if (evento.key === "ArrowDown") {
            evento.preventDefault()
            marcarAtiva(ativa + 1)
        } else if (evento.key === "ArrowUp") {
            evento.preventDefault()
            marcarAtiva(ativa - 1)
        } else if (evento.key === "Enter" && ativa >= 0) {
            evento.preventDefault()
            escolherSugestao(ativa)
        } else if (evento.key === "Escape") {
            evento.preventDefault()
            fecharSugestoes()
        }
    })

    sugestoes.addEventListener("pointerdown", (evento) => evento.preventDefault())
    sugestoes.addEventListener("click", (evento) => {
        const item = evento.target.closest(".sugestao")
        if (item) escolherSugestao(Number(item.dataset.indice))
    })

    campoTitulo.addEventListener("blur", fecharSugestoes)
    campoTitulo.addEventListener("input", () => agendarBusca(true))
    campoArtista.addEventListener("input", () => agendarBusca(false))

    /* ---------- Digitação em todos os campos ---------- */

    todosOsCampos.forEach((input) => {
        input.addEventListener("input", () => {
            if (input.closest(".campo").classList.contains("invalido") && input.value.trim() !== "") {
                marcarCampo(input, "")
            }
            atualizarPrevia()
        })

        input.addEventListener("keydown", (evento) => {
            if (evento.key === "Enter" && !evento.defaultPrevented) {
                document.querySelector(".painel .botao-primario")?.click()
            }
        })
    })

    atualizarPrevia()
    atualizarEstadoAudio()

    return {
        reduzirMovimento,
        mostrarToast,
        irPara,
        validar,
        estadoBotao,
        atualizarPrevia,
        pararPrevia,
        procurarPrevia: () => buscarNoItunes({ comSugestoes: false })
    }
})()
