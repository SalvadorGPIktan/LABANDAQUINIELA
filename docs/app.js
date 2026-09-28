import {
  outcome,
  closed,
  complete,
  standings,
  winners,
  escapeHtml as e,
} from './core.mjs';

const cfg = window.QUINIELA_CONFIG;
const demo = !cfg.supabaseUrl || !cfg.supabaseAnonKey;

let session = JSON.parse(
  localStorage.getItem('lb-session') || 'null',
);

let user = null;

let data = {
  rounds: [],
  matches: [],
  profiles: [],
  picks: [],
};

let tab = 'jornada';
let selected = null;
let draft = {};
let dirty = false;
let busy = false;

const $ = (selector) =>
  document.querySelector(selector);

const fmt = (date) =>
  new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));

const colors = {
  América: '#c19a30',
  'Club América': '#c19a30',

  Guadalajara: '#bb3540',
  'CD Guadalajara': '#bb3540',

  'Cruz Azul': '#245dc0',

  Pumas: '#b89949',
  'Pumas UNAM': '#b89949',

  Tigres: '#c99b21',
  'Tigres UANL': '#c99b21',

  Monterrey: '#213b63',
  'CF Monterrey': '#213b63',

  Toluca: '#c23738',
  'CD Toluca': '#c23738',

  Pachuca: '#285378',
  'CF Pachuca': '#285378',

  León: '#34805c',
  'Club León': '#34805c',

  Atlas: '#972b39',
  'Atlas FC': '#972b39',

  Santos: '#358364',
  'Santos Laguna': '#358364',

  Puebla: '#699cbe',
  'Club Puebla': '#699cbe',

  Necaxa: '#c93737',
  'Club Necaxa': '#c93737',

  Querétaro: '#1f4d79',
  'Querétaro FC': '#1f4d79',

  Juárez: '#2f7f53',
  'FC Juárez': '#2f7f53',

  Tijuana: '#b52331',
  'Club Tijuana': '#b52331',

  'Atlético San Luis': '#c9a14f',

  Atlante: '#163f79',
  'Atlante FC': '#163f79',
};

const teamLogos = {
  'Club América': 'assets/logos/america.png',
  'Atlante FC': 'assets/logos/atlante.png',
  'Atlas FC': 'assets/logos/atlas.png',
  'CD Guadalajara': 'assets/logos/chivas.png',
  'Cruz Azul': 'assets/logos/cruz-azul.png',
  'FC Juárez': 'assets/logos/juarez.png',
  'Club León': 'assets/logos/leon.png',
  'CF Monterrey': 'assets/logos/monterrey.png',
  'Club Necaxa': 'assets/logos/necaxa.png',
  'CF Pachuca': 'assets/logos/pachuca.png',
  'Club Puebla': 'assets/logos/puebla.png',
  'Pumas UNAM': 'assets/logos/pumas.png',
  'Querétaro FC': 'assets/logos/queretaro.png',
  'Atlético San Luis': 'assets/logos/san-luis.png',
  'Santos Laguna': 'assets/logos/santos.png',
  'Tigres UANL': 'assets/logos/tigres.png',
  'Club Tijuana': 'assets/logos/tijuana.png',
  'CD Toluca': 'assets/logos/toluca.png',
};

/* =========================================================
   TOAST
   ========================================================= */

function toast(message) {
  const element = $('#toast');

  element.textContent = message;
  element.style.display = 'block';

  clearTimeout(window.toastTimer);

  window.toastTimer = setTimeout(() => {
    element.style.display = 'none';
  }, 5000);
}

/* =========================================================
   API
   ========================================================= */

async function api(
  path,
  {
    method = 'GET',
    body,
    auth = false,
  } = {},
) {
  const response = await fetch(
    cfg.supabaseUrl +
      (auth ? '/auth/v1/' : '/rest/v1/') +
      path,
    {
      method,

      headers: {
        apikey: cfg.supabaseAnonKey,

        Authorization:
          `Bearer ${
            session?.access_token ||
            cfg.supabaseAnonKey
          }`,

        'Content-Type': 'application/json',

        Prefer: 'return=representation',
      },

      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    },
  );

  const result = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    throw Error(
      result?.message ||
      result?.msg ||
      result?.error_description ||
      'No se pudo conectar. Intenta de nuevo.',
    );
  }

  return result;
}

async function allRows(path) {
  const rows = [];

  for (
    let offset = 0;
    ;
    offset += 1000
  ) {
    const page = await api(
      `${path}&limit=1000&offset=${offset}`,
    );

    rows.push(...page);

    if (page.length < 1000) {
      return rows;
    }
  }
}

async function refreshToken() {
  if (
    session &&
    session.expires_at * 1000 <
      Date.now() + 60000
  ) {
    session = await api(
      'token?grant_type=refresh_token',
      {
        auth: true,

        method: 'POST',

        body: {
          refresh_token:
            session.refresh_token,
        },
      },
    );

    localStorage.setItem(
      'lb-session',
      JSON.stringify(session),
    );
  }
}

/* =========================================================
   DATOS DE DEMOSTRACIÓN
   ========================================================= */

function demoData() {
  const start =
    Date.now() + 3 * 86400000;

  const pairs = [
    ['América', 'Guadalajara'],
    ['Tigres', 'Monterrey'],
    ['Cruz Azul', 'Pumas'],
    ['Toluca', 'Pachuca'],
    ['León', 'Atlas'],
    ['Santos', 'Puebla'],
    ['Tijuana', 'Necaxa'],
    ['Querétaro', 'Juárez'],
    ['San Luis', 'Mazatlán'],
  ];

  const rounds = [
    {
      id: 'r10',
      name: 'Jornada 10',
      stage: 'Regular',
      season: 'Torneo de demostración',

      deadline:
        new Date(
          start - 86400000,
        ).toISOString(),

      published: true,
    },

    {
      id: 'r9',
      name: 'Jornada 9',
      stage: 'Regular',
      season: 'Torneo de demostración',

      deadline:
        new Date(
          start - 8 * 86400000,
        ).toISOString(),

      published: true,
    },
  ];

  const matches =
    rounds.flatMap(
      (
        currentRound,
        roundIndex,
      ) =>
        pairs.map(
          (
            pair,
            index,
          ) => ({
            id:
              `${currentRound.id}-${index}`,

            round_id:
              currentRound.id,

            home: pair[0],
            away: pair[1],

            kickoff:
              new Date(
                start -
                  roundIndex *
                    7 *
                    86400000 +
                  index *
                    7200000,
              ).toISOString(),

            status:
              roundIndex
                ? 'finished'
                : 'scheduled',

            home_score:
              roundIndex
                ? index % 3
                : null,

            away_score:
              roundIndex
                ? (index + 1) % 2
                : null,
          }),
        ),
    );

  const profiles = [
    'Gandhi',
    'Mariana',
    'Luis',
    'José Luis',
    'Alex',
  ].map(
    (
      name,
      index,
    ) => ({
      id: `u${index}`,
      name,
    }),
  );

  const picks =
    profiles.flatMap(
      (
        profile,
        profileIndex,
      ) =>
        matches
          .filter(
            (match) =>
              match.round_id ===
              'r9',
          )
          .map(
            (
              match,
              index,
            ) => ({
              user_id:
                profile.id,

              match_id:
                match.id,

              choice:
                ['L', 'E', 'V'][
                  (
                    index +
                    profileIndex
                  ) % 3
                ],
            }),
          ),
    );

  return {
    rounds,
    matches,
    profiles,
    picks,
  };
}

/* =========================================================
   CARGA DE INFORMACIÓN
   ========================================================= */

async function load() {
  if (demo) {
    data =
      JSON.parse(
        localStorage.getItem(
          'lb-demo',
        ) || 'null',
      ) ||
      demoData();

    user =
      JSON.parse(
        localStorage.getItem(
          'lb-demo-user',
        ) || 'null',
      );
  } else {
    await refreshToken();

    const result =
      await Promise.all(
        [
          'rounds?order=deadline.desc',

          'matches?order=kickoff.asc',

          'profiles?select=id,name&order=id',

          'picks?select=user_id,match_id,choice&order=user_id,match_id',
        ].map(
          (path) =>
            allRows(path),
        ),
      );

    [
      data.rounds,
      data.matches,
      data.profiles,
      data.picks,
    ] = result;

    user =
      session
        ? data.profiles.find(
            (profile) =>
              profile.id ===
              session.user.id,
          )
        : null;

    if (session) {
      const admins =
        await api(
          'admins?select=user_id',
        );

      if (user) {
        user.isAdmin =
          admins.some(
            (admin) =>
              admin.user_id ===
              user.id,
          );
      }
    }
  }

  if (!selected) {
    selected =
      data.rounds.find(
        (item) =>
          !closed(item),
      )?.id ||
      data.rounds[0]?.id;
  }

  restoreDraft();
  render();
}

/* =========================================================
   HELPERS
   ========================================================= */

function restoreDraft() {
  if (dirty) {
    return;
  }

  draft =
    Object.fromEntries(
      data.picks
        .filter(
          (pick) =>
            pick.user_id ===
            user?.id,
        )
        .map(
          (pick) => [
            pick.match_id,
            pick.choice,
          ],
        ),
    );
}

function round() {
  return data.rounds.find(
    (item) =>
      item.id === selected,
  );
}

function matches() {
  return data.matches.filter(
    (match) =>
      match.round_id ===
      selected,
  );
}

function badge(name) {
  const logo = teamLogos[name];

  if (logo) {
    return `
      <span
        class="badge real-badge"
        title="${e(name)}"
      >
        <img
          src="${e(logo)}"
          alt="Escudo de ${e(name)}"
          loading="lazy"
        >
      </span>
    `;
  }

  return `
    <span
      class="badge"
      style="--team:${
        colors[name] ||
        '#526753'
      }"
      title="${e(name)}"
    >
      ${e(
        name
          .slice(0, 3)
          .toUpperCase(),
      )}
    </span>
  `;
}

function ranks(
  currentMatches =
    matches(),
) {
  return standings(
    data.profiles,
    data.picks,
    currentMatches,
  );
}

function rankingList(rows) {
  return (
    rows
      .slice(0, 5)
      .map(
        (
          person,
          index,
        ) => `
          <div
            class="rank-row ${
              index === 0
                ? 'first'
                : ''
            }"
          >
            <span class="position">
              ${
                rows.findIndex(
                  (item) =>
                    item.points ===
                    person.points,
                ) + 1
              }
            </span>

            <span class="avatar">
              ${e(
                person.name
                  .slice(0, 2)
                  .toUpperCase(),
              )}
            </span>

            <span class="name">
              ${e(person.name)}
            </span>

            <strong>
              ${person.points}
              <small class="muted">
                pts
              </small>
            </strong>
          </div>
        `,
      )
      .join('') ||

    `
      <p class="muted">
        La clasificación aparece cuando se cierra la jornada.
      </p>
    `
  );
}

/* =========================================================
   RENDER PRINCIPAL
   ========================================================= */

function render() {
  const currentRound =
    round();

  const currentMatches =
    matches();

  const isClosed =
    currentRound &&
    closed(currentRound);

  $('#app').innerHTML = `
    <header>
      <div class="brand">
        <span class="mark">
          ⚽
        </span>

        <div>
          <strong>
            LA BANDA
            <span
              style="color:var(--lime)"
            >.</span>
          </strong>

          <small>
            QUINIELA · LIGA MX
          </small>
        </div>
      </div>

      <nav>
        ${
          [
            [
              'jornada',
              'Mi quiniela',
            ],

            [
              'tabla',
              'Clasificación',
            ],

            [
              'historial',
              'Historial',
            ],

            ...(
              user?.isAdmin ||
              demo
                ? [
                    [
                      'admin',
                      'Administrar',
                    ],
                  ]
                : []
            ),
          ]
            .map(
              ([
                id,
                label,
              ]) => `
                <button
                  data-tab="${id}"
                  class="${
                    tab === id
                      ? 'active'
                      : ''
                  }"
                >
                  ${label}
                </button>
              `,
            )
            .join('')
        }
      </nav>

      <button
        class="btn primary"
        id="account"
      >
        ${
          user
            ? `${e(
                user.name,
              )} ↗`
            : 'Entrar a la banda ↗'
        }
      </button>
    </header>

    ${
      demo
        ? `
          <div class="demo">
            <span>
              ✦ MODO DEMOSTRACIÓN ·
              Partidos ficticios.
              Los cambios solo se
              guardan en este navegador.
            </span>

            <a
              href="https://github.com"
              target="_blank"
              rel="noopener"
            >
              Preparada para GitHub Pages ↗
            </a>
          </div>
        `
        : ''
    }

    <main>
      <div class="toolbar">
        <span class="eyebrow">
          TU BANDA. TU FÚTBOL.
          TU QUINIELA.
        </span>

        <select
          id="round-select"
          aria-label="Seleccionar jornada"
        >
          ${
            data.rounds
              .map(
                (item) => `
                  <option
                    value="${e(
                      item.id,
                    )}"
                    ${
                      item.id ===
                      selected
                        ? 'selected'
                        : ''
                    }
                  >
                    ${e(
                      item.season,
                    )}
                    ·
                    ${e(
                      item.name,
                    )}
                  </option>
                `,
              )
              .join('')
          }
        </select>
      </div>

      ${
        tab === 'admin'
          ? admin()

          : !currentRound
            ? `
              <div class="empty">
                <h2>
                  La temporada está
                  por comenzar
                </h2>

                <p>
                  El administrador
                  publicará la primera
                  jornada aquí.
                </p>
              </div>
            `

            : tab ===
                'jornada'
              ? jornada(
                  currentRound,
                  currentMatches,
                  isClosed,
                )

              : tab ===
                  'tabla'
                ? tableView(
                    currentRound,
                    currentMatches,
                  )

                : history()
      }

      <footer>
        <span>
          LA BANDA ©
          ${
            new Date()
              .getFullYear()
          }
          · Hecho para competir
          entre amigos.
        </span>

        <span>
          El fútbol se disfruta
          más juntos.
        </span>
      </footer>
    </main>
  `;

  bind();
  tick();
}

/* =========================================================
   JORNADA
   ========================================================= */

function jornada(
  currentRound,
  currentMatches,
  isClosed,
) {
  const rows = ranks();

  const count =
    currentMatches.filter(
      (match) =>
        draft[match.id],
    ).length;

  const done =
    currentMatches.filter(
      (match) =>
        match.status ===
        'finished',
    ).length;

  return `
    <section class="hero">
      <div>
        <span class="eyebrow">
          ${e(
            currentRound.season,
          )}
          /
          ${e(
            currentRound.stage,
          )}
        </span>

        <h1>
          LA JORNADA SE JUEGA.
          <br>

          <em>
            EL ORGULLO TAMBIÉN.
          </em>
        </h1>

        <p>
          Un grupo de amigos.
          Una jornada.
          Mil razones para presumir.
          Haz tus pronósticos
          y que hable la cancha.
        </p>

        <span class="pill">
          ${
            isClosed
              ? '● Pronósticos cerrados'
              : '● Jornada abierta'
          }

          ·

          ${e(
            currentRound.name,
          )}
        </span>
      </div>

      <div class="deadline">
        <small>
          ${
            isClosed
              ? 'LA SUERTE ESTÁ ECHADA'
              : 'CIERRE DE PRONÓSTICOS EN'
          }
        </small>

        <div
          class="countdown"
          id="countdown"
        ></div>

        <small>
          ${fmt(
            currentRound.deadline,
          )}
          · CDMX
        </small>
      </div>
    </section>

    <div class="stats">
      <div class="stat">
        <small>
          Esta jornada
        </small>

        <strong>
          ${
            currentMatches.length
          }
          partidos
        </strong>
      </div>

      <div class="stat">
        <small>
          Tu quiniela
        </small>

        <strong>
          ${count}
          /
          ${
            currentMatches.length
          }
        </strong>
      </div>

      <div class="stat">
        <small>
          Partidos terminados
        </small>

        <strong>
          ${done}
          /
          ${
            currentMatches.length
          }
        </strong>
      </div>

      <div class="stat">
        <small>
          Tu puntaje
        </small>

        <strong>
          ${
            rows.find(
              (item) =>
                item.id ===
                user?.id,
            )?.points ||
            0
          }

          <small
            style="display:inline"
          >
            puntos
          </small>
        </strong>
      </div>
    </div>

    ${
      complete(
        currentMatches,
      )
        ? champion(
            rows,
            currentMatches,
          )
        : ''
    }

    <div class="layout">
      <section>
        <div class="section-title">
          <h2>
            ${
              isClosed
                ? 'Así va la jornada'
                : 'Elige a tus ganadores'
            }
          </h2>

          <small>
            LOCAL · EMPATE · VISITANTE
          </small>
        </div>

        ${
          currentMatches
            .map(
              (match) =>
                matchCard(
                  match,
                  isClosed,
                ),
            )
            .join('')
        }

        ${
          !isClosed
            ? `
              <div class="savebar">
                <div>
                  <strong>
                    ${
                      count ===
                      currentMatches.length
                        ? 'Tu quiniela está completa'
                        : `${count} de ${currentMatches.length} pronósticos`
                    }
                  </strong>

                  <small>
                    ${
                      dirty
                        ? 'Tienes cambios sin guardar'
                        : 'Puedes editar hasta el cierre de la jornada'
                    }
                  </small>
                </div>

                <button
                  class="btn primary"
                  id="save"
                  ${
                    busy ||
                    count !==
                      currentMatches.length ||
                    !currentMatches.length
                      ? 'disabled'
                      : ''
                  }
                >
                  ${
                    busy
                      ? 'Guardando…'
                      : 'Guardar quiniela →'
                  }
                </button>
              </div>
            `
            : ''
        }
      </section>

      <aside>
        <div class="card">
          <div class="section-title">
            <h3>
              La banda en la cancha
            </h3>

            <span>
              ↗
            </span>
          </div>

          <p class="muted">
            ${
              isClosed
                ? 'Puntos por partidos terminados'
                : 'El historial de la temporada'
            }
          </p>

          ${
            rankingList(
              isClosed
                ? rows
                : ranks(
                    data.matches,
                  ),
            )
          }

          <button
            class="btn full"
            data-tab="tabla"
            style="margin-top:12px"
          >
            Ver clasificación completa →
          </button>
        </div>

        <div class="card rules">
          <span class="eyebrow">
            ASÍ SE JUEGA
          </span>

          <h3
            style="margin-top:14px"
          >
            Aquí todos somos técnicos.
          </h3>

          <ol>
            <li>
              Elige local,
              empate o visitante.
            </li>

            <li>
              Cada acierto
              suma un punto.
            </li>

            <li>
              Cierre 24 h antes
              del primer partido.
            </li>

            <li>
              Más puntos,
              más derecho a presumir.
            </li>
          </ol>

          <p class="muted">
            En liguilla:
            90 minutos + compensación.
            Ida y vuelta cuentan
            por separado.
            Empates en puntos =
            victoria compartida.
          </p>
        </div>
      </aside>
    </div>
  `;
}

/* =========================================================
   TARJETA DE PARTIDO
   ========================================================= */

function matchCard(
  match,
  isClosed,
) {
  const result =
    outcome(match);

  const statusLabel = {
    scheduled:
      'POR JUGAR',

    live:
      '● EN JUEGO',

    finished:
      'FINALIZADO',

    postponed:
      'POSPUESTO',

    cancelled:
      'ANULADO',
  }[match.status];

  return `
    <article class="match">
      <div class="match-head">
        <span>
          ${fmt(
            match.kickoff,
          )}
          · CDMX
        </span>

        <span
          class="${
            match.status ===
            'live'
              ? 'live'
              : ''
          }"
        >
          ${statusLabel}
        </span>
      </div>

      <div class="versus">
        <div class="team">
          ${badge(
            match.home,
          )}

          <span>
            ${e(
              match.home,
            )}
          </span>
        </div>

        ${
          isClosed
            ? `
              <div class="score">
                ${
                  match.home_score ??
                  '–'
                }
                :
                ${
                  match.away_score ??
                  '–'
                }
              </div>
            `

            : `
              <div class="choices">
                ${
                  [
                    'L',
                    'E',
                    'V',
                  ]
                    .map(
                      (
                        choice,
                      ) => `
                        <button
                          class="choice ${
                            draft[
                              match.id
                            ] ===
                            choice
                              ? 'selected'
                              : ''
                          }"

                          data-pick="${e(
                            match.id,
                          )}"

                          data-choice="${choice}"

                          aria-label="${e(
                            choice ===
                              'L'
                              ? match.home

                              : choice ===
                                  'V'
                                ? match.away

                                : 'Empate',
                          )}"

                          aria-pressed="${
                            draft[
                              match.id
                            ] ===
                            choice
                          }"
                        >
                          ${choice}
                        </button>
                      `,
                    )
                    .join('')
                }
              </div>
            `
        }

        <div class="team away">
          <span>
            ${e(
              match.away,
            )}
          </span>

          ${badge(
            match.away,
          )}
        </div>
      </div>

      ${
        isClosed
          ? `
            <div class="match-foot">
              Tu pronóstico:
              ${
                draft[
                  match.id
                ] ||
                'Sin registrar'
              }

              ${
                result &&
                draft[
                  match.id
                ]

                  ? result ===
                    draft[
                      match.id
                    ]

                    ? '· ✓ +1 punto'

                    : '· Sin acierto'

                  : ''
              }
            </div>
          `
          : ''
      }
    </article>
  `;
}

/* =========================================================
   GANADOR
   ========================================================= */

function champion(
  rows,
  currentMatches,
) {
  const hasFinished =
    currentMatches.some(
      (match) =>
        match.status ===
        'finished',
    );

  return `
    <div class="champion">
      <span class="eyebrow">
        🏆 JORNADA FINALIZADA
      </span>

      <h2>
        ${
          !hasFinished
            ? 'Jornada anulada'

            : rows.length
              ? `${
                  winners(
                    rows,
                  )
                    .map(
                      (item) =>
                        e(
                          item.name,
                        ),
                    )
                    .join(
                      ' + ',
                    )
                } ${
                  winners(
                    rows,
                  ).length >
                  1
                    ? 'ganaron'
                    : 'ganó'
                } la jornada`

              : 'Sin participantes'
        }
      </h2>

      <span>
        ${
          rows.length &&
          hasFinished

            ? `${
                rows[0]
                  .points
              } aciertos. El derecho a presumir es suyo.`

            : 'No se asignan victorias.'
        }
      </span>
    </div>
  `;
}

/* =========================================================
   CLASIFICACIÓN
   ========================================================= */

function tableView(
  currentRound,
  currentMatches,
) {
  const rows =
    ranks();

  const total =
    ranks(
      data.matches,
    );

  return `
    <div class="section-title">
      <div>
        <span class="eyebrow">
          EL MARCADOR DE LA BANDA
        </span>

        <h1
          style="font-size:44px"
        >
          Cada acierto cuenta.
        </h1>
      </div>

      <button
        class="btn"
        id="export"
      >
        Descargar CSV ↓
      </button>
    </div>

    ${
      complete(
        currentMatches,
      )
        ? champion(
            rows,
            currentMatches,
          )

        : ''
    }

    <div class="layout">
      <section>
        <h2>
          ${e(
            currentRound.name,
          )}
        </h2>

        ${
          !closed(
            currentRound,
          )

            ? `
              <div class="empty">
                Los pronósticos
                de todos se revelarán
                al cerrar la jornada.
              </div>
            `

            : `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>

                      <th>
                        PARTICIPANTE
                      </th>

                      <th>
                        ACIERTOS
                      </th>

                      ${
                        currentMatches
                          .map(
                            (
                              match,
                            ) => `
                              <th
                                title="${e(
                                  `${match.home} vs ${match.away}`,
                                )}"
                              >
                                ${e(
                                  match.home.slice(
                                    0,
                                    3,
                                  ),
                                )}
                                /
                                ${e(
                                  match.away.slice(
                                    0,
                                    3,
                                  ),
                                )}
                              </th>
                            `,
                          )
                          .join('')
                      }
                    </tr>
                  </thead>

                  <tbody>
                    ${
                      rows
                        .map(
                          (
                            person,
                          ) => `
                            <tr>
                              <td>
                                ${
                                  rows.findIndex(
                                    (
                                      item,
                                    ) =>
                                      item.points ===
                                      person.points,
                                  ) + 1
                                }
                              </td>

                              <td>
                                <strong>
                                  ${e(
                                    person.name,
                                  )}
                                </strong>
                              </td>

                              <td>
                                ${
                                  person.points
                                }
                              </td>

                              ${
                                currentMatches
                                  .map(
                                    (
                                      match,
                                    ) => {
                                      const pick =
                                        data.picks.find(
                                          (
                                            item,
                                          ) =>
                                            item.match_id ===
                                              match.id &&
                                            item.user_id ===
                                              person.id,
                                        )?.choice;

                                      return `
                                        <td>
                                          ${
                                            pick ||
                                            '–'
                                          }

                                          ${
                                            pick &&
                                            outcome(
                                              match,
                                            ) ===
                                              pick
                                              ? '✓'
                                              : ''
                                          }
                                        </td>
                                      `;
                                    },
                                  )
                                  .join('')
                              }
                            </tr>
                          `,
                        )
                        .join('')
                    }
                  </tbody>
                </table>
              </div>
            `
        }
      </section>

      <aside class="card">
        <h3>
          Acumulado · todas las jornadas
        </h3>

        ${
          total
            .map(
              (
                person,
              ) => {
                const wins =
                  data.rounds
                    .filter(
                      (
                        currentRound,
                      ) => {
                        const roundMatches =
                          data.matches.filter(
                            (
                              match,
                            ) =>
                              match.round_id ===
                              currentRound.id,
                          );

                        return (
                          complete(
                            roundMatches,
                          ) &&
                          roundMatches.some(
                            (
                              match,
                            ) =>
                              match.status ===
                              'finished',
                          ) &&
                          winners(
                            ranks(
                              roundMatches,
                            ),
                          ).some(
                            (
                              winner,
                            ) =>
                              winner.id ===
                              person.id,
                          )
                        );
                      },
                    )
                    .length;

                return `
                  <div class="rank-row">
                    <span class="position">
                      ${
                        total.findIndex(
                          (
                            item,
                          ) =>
                            item.points ===
                            person.points,
                        ) + 1
                      }
                    </span>

                    <span class="name">
                      ${e(
                        person.name,
                      )}

                      <br>

                      <small class="muted">
                        ${wins}
                        jornadas ganadas
                      </small>
                    </span>

                    <strong>
                      ${
                        person.points
                      }
                    </strong>
                  </div>
                `;
              },
            )
            .join('')
        }

        <p class="muted">
          Aciertos acumulados
          de todos los torneos.
          Las victorias compartidas
          cuentan para cada ganador.
        </p>
      </aside>
    </div>
  `;
}

/* =========================================================
   HISTORIAL
   ========================================================= */

function history() {
  return `
    <span class="eyebrow">
      PARA QUE NADIE DIGA
      QUE NO SE ACUERDA
    </span>

    <h1
      style="font-size:48px"
    >
      El historial de la banda.
    </h1>

    <div class="history-grid">
      ${
        data.rounds
          .map(
            (
              currentRound,
            ) => {
              const roundMatches =
                data.matches.filter(
                  (
                    match,
                  ) =>
                    match.round_id ===
                    currentRound.id,
                );

              const rows =
                ranks(
                  roundMatches,
                );

              const done =
                complete(
                  roundMatches,
                );

              return `
                <button
                  class="card"
                  data-history="${e(
                    currentRound.id,
                  )}"
                  style="text-align:left;color:inherit"
                >
                  <span class="pill">
                    ${
                      done
                        ? 'FINALIZADA'

                        : closed(
                            currentRound,
                          )
                          ? 'EN CURSO'

                          : 'ABIERTA'
                    }
                  </span>

                  <h2
                    style="margin:18px 0 5px"
                  >
                    ${e(
                      currentRound.name,
                    )}
                  </h2>

                  <p class="muted">
                    ${e(
                      currentRound.season,
                    )}
                    ·
                    ${e(
                      currentRound.stage,
                    )}
                  </p>

                  <div class="progress">
                    <i
                      style="width:${
                        roundMatches.length
                          ? (
                              roundMatches.filter(
                                (
                                  match,
                                ) =>
                                  [
                                    'finished',
                                    'cancelled',
                                  ].includes(
                                    match.status,
                                  ),
                              ).length /
                              roundMatches.length
                            ) *
                            100

                          : 0
                      }%"
                    ></i>
                  </div>

                  <h3>
                    ${
                      done &&
                      rows.length &&
                      roundMatches.some(
                        (
                          match,
                        ) =>
                          match.status ===
                          'finished',
                      )

                        ? `🏆 ${
                            winners(
                              rows,
                            )
                              .map(
                                (
                                  winner,
                                ) =>
                                  e(
                                    winner.name,
                                  ),
                              )
                              .join(
                                ' + ',
                              )
                          }`

                        : 'Todo por decidir'
                    }
                  </h3>

                  <span class="muted">
                    ${
                      roundMatches.filter(
                        (
                          match,
                        ) =>
                          match.status ===
                          'finished',
                      ).length
                    }
                    de
                    ${
                      roundMatches.length
                    }
                    partidos terminados
                    · Ver detalle →
                  </span>
                </button>
              `;
            },
          )
          .join('')
      }
    </div>
  `;
}

/* =========================================================
   ADMINISTRACIÓN
   ========================================================= */

function admin() {
  return `
    <h1
      style="font-size:44px"
    >
      Detrás de la jornada.
    </h1>

    <p class="muted">
      Publica el calendario completo.
      El cierre se calcula
      con el primer partido.
      Los resultados recalculan
      los puntos automáticamente.
    </p>

    <div class="admin-grid">
      <form
        id="round-form"
        class="card fields"
      >
        <h3>
          Nueva jornada
        </h3>

        <label>
          Torneo

          <input
            name="season"
            required
            placeholder="Apertura 2026"
            maxlength="80"
          >
        </label>

        <label>
          Nombre

          <input
            name="name"
            required
            placeholder="Jornada 11"
            maxlength="80"
          >
        </label>

        <label>
          Fase

          <select
            name="stage"
          >
            <option>
              Regular
            </option>

            <option>
              Play-in
            </option>

            <option>
              Cuartos · Ida
            </option>

            <option>
              Cuartos · Vuelta
            </option>

            <option>
              Semifinal · Ida
            </option>

            <option>
              Semifinal · Vuelta
            </option>

            <option>
              Final · Ida
            </option>

            <option>
              Final · Vuelta
            </option>
          </select>
        </label>

        <label>
          Partidos · uno por línea

          <textarea
            name="fixtures"
            required
            placeholder="América | Pumas | 2026-10-02T19:00:00-06:00 | 123456"
          ></textarea>
        </label>

        <p class="muted">
          Formato:
          local | visitante |
          fecha ISO con zona horaria |
          ID del proveedor
          (BSD, opcional).

          Verifica los horarios
          oficiales antes de publicar.
        </p>

        <button class="btn dark">
          Publicar jornada →
        </button>
      </form>

      <div class="card">
        <h3>
          Resultados ·
          ${e(
            round()?.name ||
            'Sin jornada',
          )}
        </h3>

        <p class="muted">
          Marcador a 90 minutos.
          Marca Finalizado
          para asignar los puntos.
          Anulado excluye
          el encuentro.
        </p>

        ${
          matches()
            .map(
              (
                match,
              ) => `
                <form
                  class="admin-match"
                  data-result="${e(
                    match.id,
                  )}"
                >
                  <span>
                    ${e(
                      match.home,
                    )}
                    /
                    ${e(
                      match.away,
                    )}
                  </span>

                  <input
                    aria-label="Goles local"
                    name="home"
                    type="number"
                    min="0"
                    max="99"
                    value="${
                      match.home_score ??
                      ''
                    }"
                  >

                  <input
                    aria-label="Goles visitante"
                    name="away"
                    type="number"
                    min="0"
                    max="99"
                    value="${
                      match.away_score ??
                      ''
                    }"
                  >

                  <select
                    name="status"
                    aria-label="Estado"
                  >
                    ${
                      Object.entries(
                        {
                          scheduled:
                            'Programado',

                          live:
                            'En juego',

                          finished:
                            'Finalizado',

                          postponed:
                            'Pospuesto',

                          cancelled:
                            'Anulado',
                        },
                      )
                        .map(
                          ([
                            value,
                            label,
                          ]) => `
                            <option
                              value="${value}"
                              ${
                                match.status ===
                                value
                                  ? 'selected'
                                  : ''
                              }
                            >
                              ${label}
                            </option>
                          `,
                        )
                        .join('')
                    }
                  </select>

                  <button
                    class="btn"
                    aria-label="Guardar resultado"
                  >
                    ✓
                  </button>
                </form>
              `,
            )
            .join('')
        }

        <p class="note">
          ${
            demo
              ? 'Modo de prueba: puedes modificar los marcadores de la Jornada 9.'

              : 'La sincronización automática se ejecuta desde GitHub Actions con BSD. Los resultados manuales quedan protegidos de la sincronización.'
          }
        </p>
      </div>
    </div>
  `;
}

/* =========================================================
   COUNTDOWN
   ========================================================= */

function tick() {
  const element =
    $('#countdown');

  const currentRound =
    round();

  if (
    !element ||
    !currentRound
  ) {
    return;
  }

  const remaining =
    Math.max(
      0,

      Date.parse(
        currentRound.deadline,
      ) -
      Date.now(),
    );

  element.innerHTML =
    remaining
      ? [
          [
            Math.floor(
              remaining /
              86400000,
            ),
            'DÍAS',
          ],

          [
            Math.floor(
              remaining /
              3600000,
            ) % 24,
            'HORAS',
          ],

          [
            Math.floor(
              remaining /
              60000,
            ) % 60,
            'MIN',
          ],
        ]
          .map(
            ([
              value,
              label,
            ]) => `
              <span>
                ${
                  String(
                    value,
                  ).padStart(
                    2,
                    '0',
                  )
                }

                <small>
                  ${label}
                </small>
              </span>
            `,
          )
          .join('')

      : `
        <span>
          CERRADA

          <small>
            QUE HABLE LA CANCHA
          </small>
        </span>
      `;

  if (
    !remaining &&
    document.querySelector(
      '[data-pick]',
    )
  ) {
    render();
  }
}

/* =========================================================
   DEMO
   ========================================================= */

function persistDemo() {
  localStorage.setItem(
    'lb-demo',
    JSON.stringify(data),
  );
}

/* =========================================================
   EVENTOS
   ========================================================= */

function bind() {
  document
    .querySelectorAll(
      '[data-tab]',
    )
    .forEach(
      (button) => {
        button.onclick =
          () => {
            tab =
              button.dataset.tab;

            render();
          };
      },
    );

  $('#round-select').onchange =
    (event) => {
      if (
        dirty &&
        !confirm(
          'Tienes cambios sin guardar. ¿Cambiar de jornada?',
        )
      ) {
        event.target.value =
          selected;

        return;
      }

      dirty = false;

      selected =
        event.target.value;

      restoreDraft();
      render();
    };

  $('#account').onclick =
    login;

  document
    .querySelectorAll(
      '[data-pick]',
    )
    .forEach(
      (button) => {
        button.onclick =
          () => {
            if (
              closed(
                round(),
              )
            ) {
              return render();
            }

            draft[
              button.dataset.pick
            ] =
              button.dataset.choice;

            dirty = true;

            render();
          };
      },
    );

  $('#save')
    ?.addEventListener(
      'click',
      save,
    );

  document
    .querySelectorAll(
      '[data-history]',
    )
    .forEach(
      (button) => {
        button.onclick =
          () => {
            selected =
              button.dataset.history;

            tab =
              'tabla';

            dirty = false;

            restoreDraft();
            render();
          };
      },
    );

  $('#round-form')
    ?.addEventListener(
      'submit',
      createRound,
    );

  document
    .querySelectorAll(
      '[data-result]',
    )
    .forEach(
      (form) => {
        form.onsubmit =
          updateResult;
      },
    );

  $('#export')
    ?.addEventListener(
      'click',
      exportCsv,
    );
}

/* =========================================================
   ERRORES DE AUTENTICACIÓN
   ========================================================= */

function friendlyAuthError(
  error,
) {
  const raw =
    String(
      error?.message ||
      error ||
      '',
    ).toLowerCase();

  if (
    raw.includes(
      'invalid login credentials',
    )
  ) {
    return (
      'Correo o contraseña incorrectos. ' +
      'Revisa tus datos e intenta otra vez.'
    );
  }

  if (
    raw.includes(
      'email address',
    ) &&
    raw.includes(
      'invalid',
    )
  ) {
    return (
      'El correo no tiene un formato válido.'
    );
  }

  if (
    raw.includes(
      'rate limit',
    )
  ) {
    return (
      'Hiciste varios intentos seguidos. ' +
      'Espera un momento y vuelve a intentar.'
    );
  }

  if (
    raw.includes(
      'already registered',
    ) ||
    raw.includes(
      'already been registered',
    )
  ) {
    return (
      'Ese correo ya está registrado. ' +
      'Cambia a “Iniciar sesión”.'
    );
  }

  if (
    raw.includes(
      'password',
    ) &&
    (
      raw.includes(
        'weak',
      ) ||
      raw.includes(
        'short',
      )
    )
  ) {
    return (
      'La contraseña debe tener al menos 8 caracteres.'
    );
  }

  return (
    error?.message ||
    'No se pudo completar la operación. Intenta otra vez.'
  );
}

/* =========================================================
   LOGIN / CUENTA
   ========================================================= */

function login() {
  const modal =
    $('#modal');

  /* -------------------------------------------------------
     USUARIO YA LOGUEADO
     ------------------------------------------------------- */

  if (user) {
    modal.innerHTML = `
      <button
        class="close"
        aria-label="Cerrar"
      >
        ×
      </button>

      <div class="account-panel">
        <span class="eyebrow">
          TU CUENTA
        </span>

        <h2>
          ${e(
            user.name,
          )}
        </h2>

        <p class="muted">
          Tus pronósticos están vinculados
          a esta cuenta.
        </p>

        <button
          class="btn full"
          id="logout"
        >
          Cerrar sesión
        </button>
      </div>
    `;

    modal
      .querySelector(
        '.close',
      )
      .onclick =
        () =>
          modal.close();

    $('#logout').onclick =
      async () => {
        const button =
          $('#logout');

        button.disabled =
          true;

        button.textContent =
          'Cerrando sesión…';

        try {
          if (!demo) {
            await api(
              'logout',
              {
                auth: true,
                method: 'POST',
              },
            );
          }

          session = null;
          user = null;

          localStorage.removeItem(
            'lb-session',
          );

          localStorage.removeItem(
            'lb-demo-user',
          );

          dirty = false;

          modal.close();

          await load();

          toast(
            'Sesión cerrada.',
          );
        } catch (
          error
        ) {
          button.disabled =
            false;

          button.textContent =
            'Cerrar sesión';

          toast(
            error.message,
          );
        }
      };

    if (!modal.open) {
      modal.showModal();
    }

    return;
  }

  /* -------------------------------------------------------
     LOGIN DEMO
     ------------------------------------------------------- */

  if (demo) {
    modal.innerHTML = `
      <button
        class="close"
        aria-label="Cerrar"
      >
        ×
      </button>

      <span class="eyebrow">
        BIENVENIDO A LA BANDA
      </span>

      <h2 class="auth-title">
        Aquí empieza la rivalidad.
      </h2>

      <p class="auth-subtitle">
        Modo de prueba local.
      </p>

      <form
        id="demo-login-form"
        class="fields auth-form"
      >
        <label>
          Tu nombre

          <input
            name="name"
            required
            minlength="2"
            maxlength="40"
            autocomplete="nickname"
            placeholder="¿Cómo te dice la banda?"
          >
        </label>

        <button
          class="btn dark auth-submit"
        >
          Entrar a la demo →
        </button>
      </form>
    `;

    modal
      .querySelector(
        '.close',
      )
      .onclick =
        () =>
          modal.close();

    $('#demo-login-form')
      .onsubmit =
        async (
          event,
        ) => {
          event.preventDefault();

          const form =
            new FormData(
              event.target,
            );

          const button =
            event.submitter;

          button.disabled =
            true;

          button.textContent =
            'Entrando…';

          user = {
            id:
              crypto.randomUUID(),

            name:
              form
                .get(
                  'name',
                )
                .trim(),
          };

          data.profiles.push(
            user,
          );

          persistDemo();

          localStorage.setItem(
            'lb-demo-user',
            JSON.stringify(
              user,
            ),
          );

          modal.close();

          await load();

          toast(
            'Ya estás dentro. ¡Que gane el mejor!',
          );
        };

    if (!modal.open) {
      modal.showModal();
    }

    return;
  }

  /* -------------------------------------------------------
     LOGIN REAL
     ------------------------------------------------------- */

  let mode =
    'login';

  const authDraft = {
    name: '',
    email: '',
  };

  function renderAuth(
    message = '',
    messageType = 'error',
  ) {
    const isLogin =
      mode === 'login';

    modal.innerHTML = `
      <button
        class="close"
        aria-label="Cerrar"
      >
        ×
      </button>

      <div class="auth-shell">
        <div class="auth-brandline">
          <span class="auth-mark">
            ⚽
          </span>

          <div>
            <span class="eyebrow">
              BIENVENIDO A LA BANDA
            </span>

            <small>
              QUINIELA · LIGA MX
            </small>
          </div>
        </div>

        <div
          class="auth-switch"
          role="tablist"
          aria-label="Acceso a la quiniela"
        >
          <button
            class="auth-tab ${
              isLogin
                ? 'active'
                : ''
            }"
            id="auth-login-tab"
            type="button"
            role="tab"
            aria-selected="${isLogin}"
          >
            Iniciar sesión
          </button>

          <button
            class="auth-tab ${
              !isLogin
                ? 'active'
                : ''
            }"
            id="auth-signup-tab"
            type="button"
            role="tab"
            aria-selected="${!isLogin}"
          >
            Crear cuenta
          </button>
        </div>

        <div class="auth-copy">
          <h2 class="auth-title">
            ${
              isLogin
                ? 'Vuelve a la cancha.'
                : 'Únete a la banda.'
            }
          </h2>

          <p class="auth-subtitle">
            ${
              isLogin
                ? 'Entra para guardar tus pronósticos y seguir tu posición.'

                : 'Crea tu cuenta y empieza a competir con tus amigos.'
            }
          </p>
        </div>

        <div
          id="auth-message"
          class="auth-message ${
            message
              ? messageType
              : 'hidden'
          }"
          role="${
            messageType ===
            'error'
              ? 'alert'
              : 'status'
          }"
          aria-live="polite"
        >
          ${
            message
              ? e(message)
              : ''
          }
        </div>

        <form
          id="auth-form"
          class="auth-form"
          novalidate
        >
          ${
            !isLogin
              ? `
                <label class="auth-field">
                  <span>
                    Tu nombre o apodo
                  </span>

                  <input
                    name="name"
                    value="${e(
                      authDraft.name,
                    )}"
                    required
                    minlength="2"
                    maxlength="40"
                    autocomplete="nickname"
                    placeholder="¿Cómo te dice la banda?"
                  >
                </label>
              `

              : ''
          }

          <label class="auth-field">
            <span>
              Correo
            </span>

            <input
              name="email"
              value="${e(
                authDraft.email,
              )}"
              type="email"
              required
              autocomplete="email"
              inputmode="email"
              placeholder="tu@correo.com"
            >

            <small>
              Solo funciona como
              identificador de tu cuenta.
            </small>
          </label>

          <label class="auth-field">
            <span>
              Contraseña
            </span>

            <input
              name="password"
              type="password"
              minlength="8"
              required
              autocomplete="${
                isLogin
                  ? 'current-password'
                  : 'new-password'
              }"
              placeholder="Mínimo 8 caracteres"
            >
          </label>

          <button
            class="auth-submit"
            type="submit"
          >
            ${
              isLogin
                ? 'Entrar a la banda →'
                : 'Crear mi cuenta →'
            }
          </button>

          <button
            class="auth-link"
            id="auth-toggle"
            type="button"
          >
            ${
              isLogin
                ? '¿Primera vez aquí? Crear una cuenta'

                : '¿Ya tienes cuenta? Iniciar sesión'
            }
          </button>
        </form>
      </div>
    `;

    /* -----------------------------------------------------
       CERRAR MODAL
       ----------------------------------------------------- */

    modal
      .querySelector(
        '.close',
      )
      .onclick =
        () =>
          modal.close();

    /* -----------------------------------------------------
       PRESERVAR DATOS AL CAMBIAR DE PESTAÑA
       ----------------------------------------------------- */

    const nameInput =
      modal.querySelector(
        'input[name="name"]',
      );

    const emailInput =
      modal.querySelector(
        'input[name="email"]',
      );

    nameInput
      ?.addEventListener(
        'input',
        (
          event,
        ) => {
          authDraft.name =
            event.target.value;
        },
      );

    emailInput
      ?.addEventListener(
        'input',
        (
          event,
        ) => {
          authDraft.email =
            event.target.value;
        },
      );

    /* -----------------------------------------------------
       CAMBIAR ENTRE LOGIN / REGISTRO
       ----------------------------------------------------- */

    $('#auth-login-tab')
      .onclick =
        () => {
          mode =
            'login';

          renderAuth();
        };

    $('#auth-signup-tab')
      .onclick =
        () => {
          mode =
            'signup';

          renderAuth();
        };

    $('#auth-toggle')
      .onclick =
        () => {
          mode =
            isLogin
              ? 'signup'
              : 'login';

          renderAuth();
        };

    /* -----------------------------------------------------
       SUBMIT
       ----------------------------------------------------- */

    $('#auth-form')
      .onsubmit =
        async (
          event,
        ) => {
          event.preventDefault();

          const formData =
            new FormData(
              event.target,
            );

          const button =
            event.submitter;

          const signup =
            mode ===
            'signup';

          const name =
            String(
              formData.get(
                'name',
              ) ||
              '',
            ).trim();

          const email =
            String(
              formData.get(
                'email',
              ) ||
              '',
            ).trim();

          const password =
            String(
              formData.get(
                'password',
              ) ||
              '',
            );

          authDraft.name =
            name;

          authDraft.email =
            email;

          /* Nombre */

          if (
            signup &&
            name.length < 2
          ) {
            renderAuth(
              'Escribe un nombre o apodo de al menos 2 caracteres.',
            );

            return;
          }

          /* Correo */

          if (!email) {
            renderAuth(
              'Escribe tu correo.',
            );

            return;
          }

          if (
            !emailInput
              ?.checkValidity()
          ) {
            renderAuth(
              'El correo no tiene un formato válido.',
            );

            return;
          }

          /* Contraseña */

          if (
            password.length <
            8
          ) {
            renderAuth(
              'La contraseña debe tener al menos 8 caracteres.',
            );

            return;
          }

          /* Loading */

          button.disabled =
            true;

          button.textContent =
            signup
              ? 'Creando cuenta…'
              : 'Entrando…';

          try {
            const result =
              await api(
                signup
                  ? 'signup'
                  : 'token?grant_type=password',

                {
                  auth: true,

                  method:
                    'POST',

                  body: {
                    email,
                    password,

                    ...(
                      signup
                        ? {
                            data: {
                              name,
                            },
                          }
                        : {}
                    ),
                  },
                },
              );

            /*
             * Si Supabase tiene confirmación de correo habilitada,
             * el signup puede regresar sin access_token.
             *
             * En tu configuración actual la confirmación está
             * deshabilitada, por lo que normalmente sí inicia
             * sesión inmediatamente.
             */

            if (
              !result
                ?.access_token
            ) {
              if (signup) {
                mode =
                  'login';

                renderAuth(
                  'Cuenta creada. Ya puedes iniciar sesión con esos datos.',
                  'success',
                );

                return;
              }

              throw new Error(
                'No pudimos iniciar sesión. Intenta otra vez.',
              );
            }

            session =
              result;

            localStorage.setItem(
              'lb-session',
              JSON.stringify(
                result,
              ),
            );

            modal.close();

            await load();

            toast(
              signup
                ? 'Cuenta creada. ¡Bienvenido a La Banda!'
                : 'Ya estás dentro. ¡Que gane el mejor!',
            );
          } catch (
            error
          ) {
            /*
             * IMPORTANTE:
             *
             * El error ya NO va al toast que está detrás del modal.
             * Se vuelve a dibujar dentro del mismo cuadro de login.
             */

            renderAuth(
              friendlyAuthError(
                error,
              ),
            );
          }
        };

    /* -----------------------------------------------------
       MOSTRAR MODAL
       ----------------------------------------------------- */

    if (!modal.open) {
      modal.showModal();
    }

    /*
     * Mover el foco automáticamente al primer campo relevante.
     */

    requestAnimationFrame(
      () => {
        const firstInput =
          modal.querySelector(
            isLogin
              ? 'input[name="email"]'
              : 'input[name="name"]',
          );

        firstInput?.focus();
      },
    );
  }

  renderAuth();
}

/* =========================================================
   GUARDAR PRONÓSTICOS
   ========================================================= */

async function save() {
  if (!user) {
    return login();
  }

  if (
    closed(
      round(),
    )
  ) {
    return toast(
      'El plazo de esta jornada terminó.',
    );
  }

  busy = true;

  render();

  try {
    const picks =
      matches().map(
        (match) => ({
          match_id:
            match.id,

          choice:
            draft[
              match.id
            ],
        }),
      );

    if (demo) {
      data.picks =
        data.picks.filter(
          (pick) =>
            !(
              pick.user_id ===
                user.id &&
              matches().some(
                (match) =>
                  match.id ===
                  pick.match_id,
              )
            ),
        );

      data.picks.push(
        ...picks.map(
          (pick) => ({
            ...pick,
            user_id:
              user.id,
          }),
        ),
      );

      persistDemo();
    } else {
      await api(
        'rpc/submit_picks',
        {
          method:
            'POST',

          body: {
            p_round:
              selected,

            p_picks:
              picks,
          },
        },
      );
    }

    dirty = false;

    await load();

    toast(
      '✓ Quiniela guardada. ¡Ahora que hable la cancha!',
    );
  } catch (
    error
  ) {
    toast(
      error.message,
    );
  } finally {
    busy = false;

    render();
  }
}

/* =========================================================
   CREAR JORNADA MANUAL
   ========================================================= */

async function createRound(
  event,
) {
  event.preventDefault();

  const form =
    new FormData(
      event.target,
    );

  const button =
    event.submitter;

  button.disabled =
    true;

  try {
    const fixtures =
      form
        .get(
          'fixtures',
        )
        .trim()
        .split(
          '\n',
        )
        .map(
          (
            line,
          ) => {
            const [
              home,
              away,
              kickoff,
              id,
            ] =
              line
                .split(
                  '|',
                )
                .map(
                  (
                    value,
                  ) =>
                    value.trim(),
                );

            if (
              !home ||
              !away ||
              home ===
                away ||
              !(
                /(Z|[+-]\d\d:\d\d)$/
              ).test(
                kickoff,
              ) ||
              !Number.isFinite(
                Date.parse(
                  kickoff,
                ),
              ) ||
              (
                id &&
                !(
                  /^\d+$/
                ).test(
                  id,
                )
              )
            ) {
              throw Error(
                'Revisa equipos, fecha con zona horaria e ID en cada línea.',
              );
            }

            return {
              home,
              away,
              kickoff,

              provider_id:
                id
                  ? Number(
                      id,
                    )
                  : null,
            };
          },
        );

    const deadline =
      new Date(
        Math.min(
          ...fixtures.map(
            (match) =>
              Date.parse(
                match.kickoff,
              ),
          ),
        ) -
        86400000,
      ).toISOString();

    if (
      Date.parse(
        deadline,
      ) <=
      Date.now()
    ) {
      throw Error(
        'El primer partido debe ser dentro de más de 24 horas.',
      );
    }

    if (demo) {
      const id =
        crypto.randomUUID();

      data.rounds.unshift(
        {
          id,

          name:
            form.get(
              'name',
            ),

          season:
            form.get(
              'season',
            ),

          stage:
            form.get(
              'stage',
            ),

          deadline,

          published:
            true,
        },
      );

      data.matches.push(
        ...fixtures.map(
          (match) => ({
            ...match,

            id:
              crypto.randomUUID(),

            round_id:
              id,

            status:
              'scheduled',

            home_score:
              null,

            away_score:
              null,
          }),
        ),
      );

      selected =
        id;

      persistDemo();
    } else {
      selected =
        await api(
          'rpc/create_round',
          {
            method:
              'POST',

            body: {
              p_name:
                form.get(
                  'name',
                ),

              p_season:
                form.get(
                  'season',
                ),

              p_stage:
                form.get(
                  'stage',
                ),

              p_matches:
                fixtures,
            },
          },
        );
    }

    dirty = false;

    await load();

    toast(
      'Jornada publicada. Cierre calculado automáticamente.',
    );
  } catch (
    error
  ) {
    toast(
      error.message,
    );
  } finally {
    button.disabled =
      false;
  }
}

/* =========================================================
   ACTUALIZAR RESULTADO MANUAL
   ========================================================= */

async function updateResult(
  event,
) {
  event.preventDefault();

  const form =
    new FormData(
      event.target,
    );

  const id =
    event.target
      .dataset
      .result;

  const button =
    event.submitter;

  const update = {
    home_score:
      form.get(
        'home',
      ) === ''
        ? null
        : Number(
            form.get(
              'home',
            ),
          ),

    away_score:
      form.get(
        'away',
      ) === ''
        ? null
        : Number(
            form.get(
              'away',
            ),
          ),

    status:
      form.get(
        'status',
      ),

    manual_override:
      true,

    updated_at:
      new Date()
        .toISOString(),
  };

  if (
    update.status ===
      'finished' &&
    (
      update.home_score ===
        null ||
      update.away_score ===
        null
    )
  ) {
    return toast(
      'Captura ambos marcadores antes de finalizar.',
    );
  }

  button.disabled =
    true;

  try {
    if (demo) {
      Object.assign(
        data.matches.find(
          (match) =>
            match.id ===
            id,
        ),

        update,
      );

      persistDemo();
    } else {
      await api(
        `matches?id=eq.${encodeURIComponent(
          id,
        )}`,
        {
          method:
            'PATCH',

          body:
            update,
        },
      );
    }

    await load();

    toast(
      'Resultado actualizado. Puntos recalculados.',
    );
  } catch (
    error
  ) {
    toast(
      error.message,
    );
  } finally {
    button.disabled =
      false;
  }
}

/* =========================================================
   EXPORTAR CSV
   ========================================================= */

function exportCsv() {
  const safe =
    (value) =>
      `"${String(
        value,
      )
        .replace(
          /^[=+@-]/,
          "'$&",
        )
        .replaceAll(
          '"',
          '""',
        )}"`;

  const rows =
    ranks();

  const csv =
    '\ufeff' +
    [
      [
        'Participante',
        'Aciertos',
      ],

      ...rows.map(
        (item) => [
          item.name,
          item.points,
        ],
      ),
    ]
      .map(
        (row) =>
          row
            .map(
              safe,
            )
            .join(
              ',',
            ),
      )
      .join(
        '\r\n',
      );

  const link =
    document.createElement(
      'a',
    );

  link.href =
    URL.createObjectURL(
      new Blob(
        [csv],
        {
          type:
            'text/csv;charset=utf-8',
        },
      ),
    );

  link.download =
    'clasificacion.csv';

  link.click();

  URL.revokeObjectURL(
    link.href,
  );
}

/* =========================================================
   PROTEGER CAMBIOS SIN GUARDAR
   ========================================================= */

window.addEventListener(
  'beforeunload',
  (
    event,
  ) => {
    if (dirty) {
      event.preventDefault();

      event.returnValue =
        '';
    }
  },
);

/* =========================================================
   CARGA INICIAL
   ========================================================= */

load().catch(
  (
    error,
  ) => {
    $('#app').innerHTML = `
      <main>
        <div class="empty">
          <h2>
            No pudimos cargar
            la quiniela
          </h2>

          <p
            id="error-message"
          ></p>

          <button
            class="btn"
            onclick="location.reload()"
          >
            Reintentar
          </button>
        </div>
      </main>
    `;

    $('#error-message')
      .textContent =
        error.message;
  },
);

/* Countdown */

setInterval(
  tick,
  1000,
);

/* Refrescar datos una vez por minuto cuando no hay cambios locales. */

setInterval(
  () => {
    if (
      !demo &&
      !dirty &&
      !busy &&
      !$('#modal').open
    ) {
      load().catch(
        (
          error,
        ) =>
          toast(
            `No se actualizaron los datos: ${error.message}`,
          ),
      );
    }
  },

  60000,
);
