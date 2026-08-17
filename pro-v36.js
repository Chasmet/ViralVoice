(() => {
  'use strict';

  const mediaFile = document.getElementById('mediaFile');
  const projectCard = document.getElementById('projectCard');
  const sourcePreview = document.getElementById('sourcePreview');
  const sourceAudioPreview = document.getElementById('sourceAudioPreview');
  const statusCard = document.getElementById('statusCard');
  const statusText = document.getElementById('statusText');
  const resultCard = document.getElementById('resultCard');
  const outputText = document.getElementById('outputText');
  const copyTextBtn = document.getElementById('copyTextBtn');
  const newDubBtn = document.getElementById('newDubBtn');
  const dubBtn = document.getElementById('dubBtn');
  const targetLang = document.getElementById('targetLang');
  const voiceCard = document.querySelector('.voice-card');
  const logo = document.querySelector('.app-logo-img');

  const LOGO = 'data:image/webp;base64,UklGRkowAABXRUJQVlA4ID4wAAAQswCdASpoAWgBPmEulEckIqIhJXK6OIAMCU3b2Xm9NjOXf7rzx7P/j/7r+vf7102Nc+Xp5v/Bf9r/B/k984f+L/zP7R7sf0b/1P8H+//0D/rR/zv7r67vqy/c78cvgL+w/7We7T/pv+b/mfdJ/b/9P+xH/D+QX+mf4//5eu57Iv+F/7XsI/z7/Xf+r13P3Q+Fj+1f879u/az///sAeu50t/FX0q+Jn6T+4+RP4z9T/nPzD51nX/mr/MPwb+g/vX7tfml81/9PxT+RH+B6gv5H/Qf8x+bH9440a3HoF+4v0P/nf4Pxo/+P0V+wH/X/wPwA/0j+xf8nyhv+j5AX4z/fewP/I/7Z/6v8l7tf9X/8P9Z6GP0L/L/tt8Bn83/tn/X/xHtz+x394PZtKIoDVsmAmWwbqVxauUPrHdKXxd9Uv+BiRJ3Qd+5eUQB4P33Cui+SKUpjBhUPi/O3Cmi4lyDVkfqg+P6MDW5Hz0bpE/5ZO/GT9hTZZtAiqsQX95ekIDV/78IFbW/dgX9RQwOdr7/cea9zyTfcXxVLtO9YIsDa+BAvUfwG9+B50BC0J6i+xAToKslaEnC+KxTqBjTMihE5amAF5X2BVE2V4zS90/GKLNysOoDZafZwk5YWLE3cCw5vcmjuP5VnFDe2lTUYNqV68/hNRYgcTyUA5lR2c76LimWnvl0nbYulgFezG6NfmSX+oUSMNmCeLQ+Bgwl6uk84+q+BtXlWCfXF4vFYnhYJIqu6MLSTs2vbSVtrsvcN7pACtZ/UtkFdraeddLoNUMhfv15DVK+dms+gBb07JZw7zCNjsrciu6/9Q9WQhIzRpw0Hw8u6g2wLdl3gcPm1d7ZX/KhzFgcVaPd6SnoUa02WmJ/iuI176YvSgGjZIrcOiY1mc3bnhCBQi6PjWIfz3eFwIdTYqhZBv6IaCF9ci+iogHW5b2bxENZ6zDqBjJUct771gl364VoCR9TP9uL3PNu4LxjnKrwsIYfbedLxLFTou754T89m50xn7baR1X2xXNq2KIm+8tSi253z5ObwmoC38L4H457d4eWOklXtP5PIB4ZZG8crXv0F6nnhXmMGm3N8DgpVgUVq9oah9dUzyVsfG7w9hi4Vk2saG/iGFy7HCy2GpAgCjfkLPmuZIAKri8p8aYbIvkluUB3VQTosDWikfyZGdVLFK3jses0XxvWDuLar8lBBPoPgKczbBlYE+KhqdFQ6jmZyZsr92OutspDYU+OtZKT0Qr/mprfEyNen5Zq8095y7TBdQw53Zf+qBGvsZ3BddcAegaJit5WGyxI3RCIrm5qJ+vCbof3vOn4UyT8rPmJPcWipVf07khrD4IityhHkBKLvzQ9WyB9NAF7b+iZ5cAReGfWghnClacTIaVn4MycvRhl/ii4EmgpZVGut9EMG511Zn2oYDcPYdV1KVzS8F/EEZgmMyAYIvV+ENXVfKyERxjuyRYZpPJjiqdjbRqcHDF/CSWU3FzediX8l6dM0y+7bcA1ht3HDdSUsWcktAGk8GYfj/j0n0VZBrGe2oTGv7JXfWitA296AwS3nD3Z3auJoPUuDuQ27gwAtgETOCc9TeO5R9o9FN2HAaN546hnEcGe6syI3QyC3ihR35TJ+iumzLZ5FQKBs6hlk0vDJOix7DsQ8uS5oAxvAjX7Q6QkhCs+wksQuSJmPO61PjYO6pN94dgjU+Tmj+dXKDbDfRdrEAYDPps+yKflhXtAEPblk5iOjg1eVBys7vLUButMBaAcY/0RGHjoallQnixmJ/9SLmY+qzRhDVMne/bbHVj8dUWKRKSEqpaRkvT/kecdpevPjZMWg4HYJcHHK8VEUDUVrMfwWorF2LrRFK5vrDnm0AqvwkMA3S0z+PiQArrLKrLLrQIEY/DsSZs9u+o4fRf2CDfkZb2VxauUgd+IAAP78wl+oHoasV/x46pN2GNqPGqJCucFRdy7b8xaQpBbU+qX0Hrf4WZWT2MgYNmtGpvsENgTjgqOYOtzsl8/MH6apM+3X+Ann4s7yUEVPCfONMiUwBTpOPASbnB4/1tIlOfVLmECaRBToebPCJbo0b6frBmDdHAUBSg6IE22KNvA1ctyydj8Wx+9MuOK6yfZ8CARayEftf+sG3WpQhqoEjVt7nSNwB5TWkB3SQEJDRiH4ebc1OOVZ8TxPtEGf6EaBufHV0HODkcq/z8PzjfizOqFmWe6ClmneArav0AudosXNTi2iKtq33gvKKdlor9AOflDehtW1mXKuFyzh367E07m0vWBpYyorEJDT1fm6/Y2gV6vyJMg3++0UwfZkjhtDkOX0xslNFnJo9xiETyuKWG1UxSxVkWs092aNZ+HGBGaB0elHdalWYGPAOSrJH9/95XyQVpvpmFENvx/TKppei5YmtFbvZOCAa5DfxOLp+45bFwaCyQPiET1kpdLl/bM32HKSBL9Lspf3bAdqzJh9tAHAmAZVM+LDh2HZcxgQh3y9m7ObW2o05HwC28ghxl+/dDbHJKK60HOq0V/yvHrtkLX4lOjS5+STyJwKCR+bbTU1Mdn3DhItSQAOZAMxL7dChb3IPBKNB5oAO5KvmXU5WPf0VXBGFXVfyG3Q4ePkcfqKJDDm4bmGjdk8MqdUwdLxGwvAEs4eyZhpPXzcWTNFoPR3gpflbQOlUxZ5c4VwqxKNAANxXLXj1AfQ9F355rAmFKxPXJeswVutOp/cqk4MRG/pisKsjGkHU/y4n1bxlpFr5bDI2mFEagdBAm9TWj5txGxX3miRqF01IfP8kaKc659aj3HMQF4RCSsyTr3Xm8cQvzAMx4OKjeO/E2qXkloFYGeHsCB8/wZgurPoM3ZkKolRva45awUKBbBRb1FwYxgWjFe1YnlMbNb5TgV3uxJZ3jGnqIVe5euRVLub1PTjxD1RJQfcHiUOGQCH8G3mGJmw97P4ZvnqeNqmKKiQ3Orz8M8kRonJBQVUQTROoBy9rUhxGEMjbM1YQArJYthhgI5gn4laeD/ToYwKT0UholdusnF1o+Z0Va1A6Ewg66hgpU0k737rZyj4gA5Z/zC+xH633g5BPXIbxPDbKkgWfUoXzJ92WfOQ7jbrZpYQ/pk+8W555F34w8XZ5/pJAzVEIwb769bNZLO7qQ6GQ547YEyMSNKvyqSdwM46xyeVnfc24cZDkSUkhwsM6fyxpSPZIHmJlzRa1voGzbAfXI4o7DlvroCyrTPsmISzvr51N94HU2CAB7qPvvYA4wg9vJcsuPnQ+3Yh4g90O7pbRbKJ9IJYql98qDKpj1RohBiHlbHg9WJnli3cmPUoSM0fRNuKBf1FfveBG1uCJYiY6IurUXa/vyVPcgWJXYFNKsCSLQD3FVVLTva5YBbkwBApfdALJ2Bh8gUTfYseTYdbO42H6AOTi03gZRUP1IYC5hVTFRTIZkhn38BA40o1n30l6Jp0nGYNLhIqfJNVm99sJ6htm0f0QiOCkA0UKfU9SBqW1Q6N3WMhQjR6QdnW/Mj/T/CBPIj06UTwg/BM1tGYbf7ZvLpXyT+JPHvvei+QM1+cITuvHPhcBCbJdK7TOsJIPY/2o+/xLBzlq43hoK8ZejcEAmSs6mEioNVW/wkiuRtguPHhHPPHFS0ByXhoC/SVddebsmaBXs2P/RjQzIc/sRKzv/m3cXxW7hqELVpK8Hwesd3lTOKx3QSfjK9IOr59SOwUgGgqABxzQy3G98EhThd0QI0I/eIX2EKg2/GeOkWXMsCqWSUUPJq4+eKZ/VjzZi1WUKD8QAv/XsmlNmFltWhDKm62U6PseYIRdWicaKdMZLfnIqMlMifE2CdVa0b46m8BD7lxqes0blOaMd8cFcMCExvd6gieokhzKIbyAoKwLe+qVrbin63veVdpZYs30Zc/74QyBKiZxIKsOhgZJH/Dj37L4Grdr/xC2c55brhsCVTGWMKhD5/M0c7F1853kBH/feDgZDNwG6d/t0OGsCHKL+dwadPJzwyzDkf6QB18ZsFaaVhzsd06JYWiH+nnvUgPGj9mifhBW0CuFXwjEEVXhtv8s11Uem0CL6MhRUTZJ1l0vkf2Z8ef68zK4/FAHW7u3apINVaeRXAsPjBf0QzTId70JlLxZsLwVZEi7eKx0xAXiXDY7ZZ+0zXUxKPkXhBAgoHnyB+XAx7Hd7xZp3COB0LQ7vPM4NRK67VELJmN38Kc6kFl/5iAEyVAigWmfnjpCuwJs1wOrG8Ru/MnF0nvqhFuTA7qr/Q9XSWk+W+qWu25GCFbn72Zffv07AtibfeWkEg1hEVGv3Y4/5JsfkrVd4jz6/d0/a5RKBZuHoeiygX8MsqH+6FHRMYBtGFJwCEnEZEcB07JnSkugB+fi4RlGT4c1Hgdf0XAq9kOJPSiwO3v0tW9uCQA/QudfbFEeJVlydK2Acs2VMeTgYEMZ8kXKbE8EXWJq8hwIqDHfYhyDqFEtz17lFZcGrbI9dxMF/kUOpheXlMizj0TlxV8vdwOsRAESnVCE17Pkl4q7gBIjpl5hymEWm86w53QOfKGe+Ovj2ZHyFyGir0G32G/wI88+8EI+oZjNiCOUZzM/JmZEX9xDhJ209zzEEVV6hKfBZtydoRWBTgEvwYPHW+f13erJH0xOCucK+UL6FcQF9IIsGDZygcWHPxrG+c34CeWnsJnk1iV8ENkeh/bZgXuV67JjY/MrR0qZnuwc2xEhJOIL0LheeKC3sF/q59ec8hAR+5/iqn6MUbr/jXLA+yVICeqbOFMYlNKGLJ9ybTmAb0BDWBYZMUnVogI6GxLqkHkNcHXPAjFpLHTBXEcMl3Gp6GLgphloDSCNU7pA2IGs1GE2IRSgwm3lrLElwlLod7jDxCzJPRaXpsUNvK6VkRg1wp9KrCH82DPx5DaNS3x5HGYs9b/jbQ7+93/9RXiopI2/9R3IB0UqnPKqRT3Yr3UXLh2tvOPd5c7mFJa5jhGE10cmAhIjjdtPCvQyOHRKAAE+Iw/kOQr0dX2HAzv3JNqoGJuPEjlhMoRXdbn0onFKh6YfgbOqTI6sUvBs47/JaCdSs2pnr6KwvFKCJfWxrSym5O4hjih8r8GK1B7h7fUO6R3qCojJSGYTou6Y+Ftjpuv3EJerfVutbv4iUPD3cEh10IAk9rHFu2TpCk9PfkQoSyd5cOyPKlA/J7wT4dmSJf4kYHXSnJpVfGxKU/j1HEsp2KzUZ5T0Y7CMT7YSDXTJbth5UhCH5nclSy/WyKcYDxNNzYR4feaNyey6N58dydagd7lnSZK2CvSdXBsmrFqu2/ly3ZPswnOzMF7rxwqeycXhbb0CkympGk1jhs6dNpwn20NCzGwqGam4IOcWTmsl3jDQQ6UOFAqoPNPasH17flAl4wvv5EUiKcny1nwOrRbZ5ny2fGWqoFdJRhmRj5cDW47kgbKIm7zmjvt+3u0HwDU6X+nI3qp9I55j0kKEOTAZ3+8nHnr87Qj0KHkaBhPj09POZ+UENkRnzFG/EB66f9Wh7IYkV77mehxPskxbTSZMO+lUCIHZMRZPJqxdgLnNDfwPTxXHlTo2J6rQmyVsbz7PZmhhU5pXmgMux/QGWxtFDhRt2E9iaburN2Wh5yV7nPYGHO0YINq0FmaR+xGOLmkUoOO/YUDR327O2Mkj8PQAEmsQ5kDhladCk9r8FkemCVKwBT7GhhI70QAQbD0NujPPGYOLYFCBc8J5EO1foW7wNEU/HVSUxLGhDtn0uU0BrCUcJuclJOnzVj8DRPyEJ/llEsI9q/9B5tti2uxacknbdD3gy8X+u/AW76qHdnNxkDQ3ZvF73hPCt59+tFM9ULq/HK0koF980rTHEk99KLrhZlcOLOxKIoVmF+80KsN34aDY9MolMKJuu78w/Ddw7ZQbsuMlpuiZ7Z34pyE4UA1lELHQarQZzcQeVMabBZTxzVYOy+Bkf09QtO2Xn0X+keAMoLD+yfMh6y0mPqkfNQJWCqqEfMGvTLa5hySuzBxT727JDwIqln5MdggnkzWbPXIjV1NlVcH3q4zuAmoVl848i0ze4o0OrUfcCrxt+ag3YHme/OA4/HW1hoeciBuPzPksWapI38Efc77rFiEzRU2/gCM0mPtYZu9nn0dYrXbbEXXIoQ4ZLdxmfYI+gOi8c2yyUqaA1lWZ9PYd7DyElJvVXwU2pQ3Xnp1qxfyvBfzf+JcsGTXR0vunFymL+YukE65BKQY7XjjJAvOiqMw8jeoArDmyYydUvmxgnTkFvCVmuoSyUbSJDD8qykXIg2X2I0dBVZQvrti8O8JLDtn1Pn1o+VFlDkIEaL8bnQO8nXHlje+hgyzd2y7DgDrKLl7/LiTAJB8ClbGm24UQDMuimPMvtLl42BN9Q/CwkRp1LHlRWfjxmZDex0+Z8MXrEKxxZgbJSi7bJ3MR6IGsW1oL1lh3C73czMG6VvZya2vM9KFeCvYCjL1VBdrMnCprPk3+lgllsMWLZuHbEuUcp/AvXaCWsY+rziGd9IbdKYCnJ7UhVBCkdFJLr945v+xaZunVPskeb5MJA4ad7WtpaA7UdLXmaWi1V3olZIlKW7rZB7Lq6+gkA2q6bTFiCBCz4RGpV1RD93RWhJhPTAvbTVvHxCPS3oeepni5dThln+3kBnMf5tAAWUdYzTIhEFLNPNcJJa2Rm1rH7z4npwe1w5vdIu9DGfllCxU2MuRNDIm3CtQ6Uex5oM0Whp/cWZQt1JcCnQdFZWaqISJGGasTxP7aEGh7/eSUaUvBwN+Lb/tDP3rfjA/KG8KgMDTAgEsfRgyJed9oKikwnl10UO4B/HCxUwQpb2b/AEYaSaZz5Z46YHc8FUoSKYxocnQDrpPgwnNRMWSr+X0raaaev2LwXowxeegqHCXlq20iby7xz2Dhbye0XnX+KRIxWWG7lpJfDGYehvjl4hDtPz7PcJcJRbu/ojvR6D/Kk3V5PPXEY19o7HnYKteqo0eHcnHgREpYU1WP5ngBc8+yvQXq9WIcPRRZj2do+rtOhZ1EievGWOv0dD/zcfZqJOTRv6MZI0cx0LP1XH4us1gGlV+MAUeAeqm42xRLE5ud6Gv8E6BRWtM5uJT2uiS4lUbpfqZZNNuZ2N7rbc09ZVkyYp8uTLG6Sf5xW0TE/rvFnkq0R0hE8HEjcxmx5lNE7uNdy1hhmYfI0EsiZp0LyXmwGvWKRo2aatT6QRdJEnC/qhwdhXU/PiJFPfEmILMlN0WVjn5VmoOvHFNeowrkNs2PDRouHaTXXorPBxDYG/A+bDJNISEsj0mjj8x/wSpXApZdkddLp8Iv6+SDRwz/pGOBmiwn8x/WHpo3rEKDePMsb3g5plPunw3KAUDrzdVd1MHz9JgsNfMZlwlvTDI4nsXJLdLxUtNwzrAKBKbLcf/wnoobNu0Ob0YrYSrjakOllYJiAd8hSlTwDPoGA7vKnGaFM2KTQbMTXYtatP2cr6ZawLhRH7HXk9F7wvib4GE5g4ayK8eerGsxt6c840bcCNT5JTRBiLDoiMLQMKv8lhTsB/eKwQZGdirFkhy7stWWjMZtpr9BFedkKQwnlvzdU2rYifVEx2yp9Q2e/oh0dG3I+I5OduHUJrbL0FUPMKUul8lG4228gPeHER6iCskjv/nly4I0uHPw00mk54LcDy67lbjtP/1XjRywkMRlxA7zPgYe8f6b+loLItICFWMaDgvQOw1kuN0uT/ndQqnMOLxLK/3Et5ORqMuZubkoDt+Qx61cBB4MGMIkIa4RlvunBmNaVKzLhIv54+3BpD140bAcOzMCD1Crj9/L2S8K1LXZlBUrpOuK76MYd+VXZZh0qMAKBDDj15WKtgLzSV6DxtQpQBGNshTmhQdou+3pK6cIs7My5o+mHmmnpVkqXyoeCBh77271DTb+EAJCtGLqgphISFWtFhy/6Swp84NvUCLoeceJ53jHhQ9yM364ad1rqQwm0zF6N89JcuLnTFJINI+ByRnIIHJMjFxSrSHMkG9g0znP98cTP1bmCu3VMef9mmxvt4oFnxqNeI5TN96j9s/K68bZt2b8gcCOiBKs/gz5hF8TYnUl7kOpOSxNaHk//krosiIz2PWY4EWJeOfI6+ugXAz0mZ84+g8QlQFcxrmVbbvXFCuV5WZamOO8i+1jHkCXyXkPkHtwkhnWSm5DQZcGgmeJ3J+TyY17EfJuNLiQ+s031Tx0ycOGkbs9wKMj1M6oEifRgElbpoCaEkbBmvUdGB1dAVX9yZ5EaMPPN1pWVy7uAZFv4YQQsQrgK4EjBRMMU4CtFtY+C8qMDb4tCjZ6eRucFhXrvMs1eJ0OBHYi0k1HhK7+05pjQ7J89s2biWrcxboYJPYwtcfcf9RCrhNYzOAlbzUs9sfkTRpOCjp85BiGNn/oEeC6LTbh2LvHcqRE+RVi/MWForXvkfAFJgpmwzUSwraKm5qXGVli6Jgaz7GLyFL5swbDZwCOI5zNAmNKjV2VzCiTfwz4B4kZnLmGExFzUpzs0z6GlFseaFVel/KR2rAumNwCTmpp5WUx+cBpZngdaZMx4OY/6pQVn/Yo+mgXiENbtrE6SR5tudK41UJ3chkVU2EKZ7sM72a6B1joHHmz6w6tXbYiL91dcj+8By23owcvGuTEXc3xjxSG5hTfRKmj14yXg6pSV/4FdoweoI1eRSx+LgY/9qedqb9zKFeYyASRkl68vrWHA4l80cDa0POQ0871qUhlWwiFnqf6oDpwrW7U9ZTrl3qGOYKYfZLNIMG5CL+bCzAbU3v5FtjYZQkDtAUkXwqqTsublFxOQrueIy/9aJFPtbO5gbmD47sSU/8DwK12IThAbgzkm7YFCDDt6RkHT0M8P/XsBT2qdUXKbhD0C8xUSvruUzgM4B+0GeZxeCajBIknL3tw/OSJWXquzswBMZl3jgmoHqvD7FdQf5JX+bKnfWEsZFJR4kz1hiYNB2ZuIM2ic5/DCT0qWtdb1yMgvItf3ujG8F1I9Qa/g0Tjk7iextWXfPnQYlDSanW0WYeobxWgJkZS5B9IIoQKLjpJuRmcBBCljB2WxfuDG+0L0lS4PfKavDobDPXTWhpaWJxHPgLSneck/XP1aaBSHiu6B921m43sbOaBA9KEd7jU1ZbVEF0BmMZPhT29whmlaegjliWyrL/FB97oJPT7/x+vUmNjP0FBg43QE58Mjjh+/hrEH/LFWeVI+kJPFWGiP7ByPKvoBlbZr97KxBRH1dljLQqMEt2Hcen842I1dmel/fTkp2GLW9SUIo5GvJVoCVV0aQul+BShkKoCavL6pVJ7r4W85DtQo6DibXC0zF0uog8T/KttOKqzXnprtrksrcUHwVX/lbUWqGyr6fInsu/6DfmRndqjlfdYV77HxIR9UzMosyDzaj8XqSg8EM0jrQ2W3hAM5Hg5BJf2617DtzxdVZp1rZhToTQscn5KKoqqVAqQ/uq23PYPZRnpXu2WqdYNZUrjjHFc8SSZO/82RWqfO0k5CDjX4X0igO5GWP0+ZbL2XN+C6VG5mXPr7o2ZEFkjEwYQ7xynGX/kltAlzUoFGl3FHqLl/2+pJXnROG79BeyYzz+fPbNlN9U+lpi5r1OJwUBFS+f5QG+PE9QDpLD2XslznTqiZhT/KQ5fi3IAuDnvcKcWNAUFAu0SwzbDmZRbxONrx5Kfz5z4PdEgOGLZR+yZhKOphsVEuxJaHhobPZukYub4wQ1pQqdfehVjrSNyj/f8JTJr8MGfz3F+1/5uIomus0+Xrzdg7org9yQyNkFQYVxgZ9CHW2FyV5jJhYzgDkxrSWj4T5n007bUJMBTUswqU+ioGkiVjDFFDrW1HY+C6tgKPOak441hjCSIb1pc5br1YMOeMxyss4luePE64D0aExw8XUGWcbaLlXMy6ngAuaolEc4bUhiodDgwjxDlLiWypa7JRXbOZP0j9mVkD4tIs0WAHMK5RqXkriZS6JdKKLGyMtPApVoIXKh41g2YX38b5fRZxubUUHnrH4WRQePxFp0wrU+HZtj5XD6gFGnbYxIW+BCjzmeJn0i0liPoBcjk9jtYksrwyMv9bR4tZxwrAacNcynjjOMRnUzwxdBp35XkP7RtzwpuF1SRwaoD6nYeCU6sZbq4HIaeynshKbSKuvMmtyJMBOKaC+F7mBCnNrQ4IQW05L5hQnLiFpsSF4Ee7GWle3/Z7RZVTTuTKKLIWsld/EU7Xvj4xwgXB072GfIKkSVWjk95xnaed1V+p9HG0O+DdKMyQL+FTSw2w69SwPByBpg7kQ3BxQtIy8mmDeFAA0d87VaKSyroSITwQXbrnF0W7Uuv+VaJkNcwmNiqmN/8cxWhXZ2CBF+y+F7Gwf1pbjYDAbQAtNITAWH2a56SWBi8PuSYvt5dKs5CEBmuO1Aba+TKLHT0GfxcACZ9tUNe/bVtQ0zhtJC1dX07p/l726KsfH10pkpfWUvxSM2HR7V0vgMVu+ZQmO26nuq/3G406BwKskdPyii+xmntQonCGpt5hZS8Ycc+xW8cZOSPcdCvCgAXiKinweGGpftND0inpv8SG+yRaW04C7kARdWG34PHchEhrRepvqkbYdGEBm1lqWiBD9BnCGJF9kLbwHVVkO73Auq4X0NZPZxkq6md7Y2/N+cDzFqOT0RtQb8JeJK3vWFiqWkby+4zVIGZkZBuQM3MUs3OWRF2HnPITcItEP0QQZGNuAHn+m2RASS+/rUq62BdnANuyJcUhPwARePESOqkPH8hkP4Yj/CQE45QCYw/GFg3+ojHyXpYAhLNJMSivTCp6DmO/UrskOPyrfBW12HkU+5kZ0UecPh9cQpybQotFUUWCYJMmK4P+vdHmtG8FNs7LLXEmWBI47bY8sDY0qfa+RIgIr790/bc+09l0252Hco5ybmeGhMj3WiTXik0dWV2VvCzz0gXWC2+atHBG5X7NngUT7aMjpfwB1dREaCVt5kgncjXgPQbPYMo1H9C5r3dsjjKMH70rZE60B2eYLuEcFwohuYhExVrKnXoo49NbgQEglvKZa7Sp3Xn4LeQPs2krCD53YlwHvg7eK/uOXXBFrSOFmY4wrFy99i6R3ISZ5KPacchBQGjdopPAWwZM47FBi0kdKLJlgBeKQqnc3lOVQJiumV8RwT1ZDJHFCzyEdTaIwOR/DFnnwttcabQaY62e6M5SX0HavngCjymjetmdCG6rN3ohClTjmry9wklR2mBaWkQOznDE3TQJSc99KMiU7NYqDJIUIn0YKQ94KcCl6SS+j46zXwxx9DUR5oU+HLHLeVUHOMwVj/uQcIp5E+482CGtm0cFdHfbqQ+2TuaRoCGwPIwlQ4TrKC1gr+FbJgVhcCly0ERqz++KZGGkUU9IcgUH3WF9EhcbqJq4CapfwQgv4H21qCHBVpIWjJatwK9k/eK2E/ZO2/8hk0crtoGeWqn6vAG7o5STVz6x/9QdU2IMXboIe9ZYtcww/XifgMVzqQ41BA0tyuQUZqLoH0hnGL1+BscjcRrMcXx20qEBcxCINcyND9ubKPHq5MWvdH00/gyNvTg6tXcP42u3lU6l5tbbMeaB7KiyJZhmBv6o0P1bHbFQtshz4i0RN4xpXOKUcGSe97iAcl11vGKRamIkhiNUeL+mMozRZKP3Thp97hXM0pvXV0ifVXc2UG4yUPO95/7i2jWUDbGhIAyOaYyuwRi2Re1gg+i2cX+ruk3UOz+Ssgegz8CuiW4MbPuTVWjdfIQJAHOVOvgGvnLDPuwgpmwO7TubO49Zu5jMlr4V8CInKlv1nsqtda0rwXolRXhkYzIZ/PhBnrJ7KsIfmEGtCISLriV2PrGjug6IQY9I63kNfa8j+Dn5sAY58NdNubRMsIkEivYJz32u8aVJFchZZD5nE9a8Uc7aLQLVgkngHn3GinB0I9SXe51EvXhApWEdRMTJivu2p63VythKwxMNynxjngY1eQD/zCozew1PylITsFvr7FBZNEvgCpPk55r5cg9mFMYGunbjhLfCHcIRvgFqzmFf1CP4WtcrBVWZ4AJSBV6uYPwOHhFVmYCkZbDeQbONnbd7I3hvqiffU3C7/0uhNgostb4Kj//tNJcQMF9/97x3CoFWFBatcgdNYgucYLiT0SoHFho5PfLPeev7x6upGaQygbavoUggWruVBlk/1km+zZp4wtuHxYOK0v2i7ADxPRX+bjKRLFKZVHnH9Ya71zjKXrh1nkN9xozwawwjd6cKaKLDp+ZyY+6js9Dm34HUGxa2M50luasrhVqwEAr02baM1JXTtsyW1CnnyA0CGSsDuiYbU0el0AtfpIofwHU2K35dqukVhrqMOJk96S7W6aLwUes//iEWlaSdwZsnp/umdsDL7mvhMdYaTRCu5OJCzTlyzXTIPoalCzvd6F0n9iMWcmhnOydB8uQIDMC0sohSslNx1POHvfpS6lSEsato9gSnMsH2UitGsMH4nA+YFU/k00yc7K+zus2VGNcxZZE/0gqwUdoQYDhRSNWaE5fCkoOWdPu6ZyLgns4fuY9NPfYmBxXnMyH3ebDE/Qd5o9lH9E2PTAuvRy/J+1FrKqXGPesZXMn5tqYXNf6QPASj7c3EU081PBhGSVAPFGPr37FXMWTuAG1aMUZbPj8mVaaBJta+r6XWISnVgDWsoPvr7Vrs8pHi11Et7DtOlAWrV0caLCXKmY1CyRJsVTS1WsyEL3lISQr2Nrzuk1AV+LLQimSeAYcazHNoYKg+uaKCWscBStF+EiMkhCpOR0/bR2gPFF9tjbtJS5C7x17yPv1Jlecm2vsSxH04zdNu7abrwLhdK5EIMXDRhxK7qpgzJThW0aM/SbBuW3sgml/663QQ30IUYo1DYtJefyVOwk+vucJUfkWr70Jfz3vBm8uYV+R/oNDZn0dD7FwzzqwYRr5S72cVAdnHQO25ZBasqTV2cgjypv+t2TmtHvAJuhjcFi+OVuS9IgTz61n9jGqkQEyXLg3M3pvy3DYFtLgQu9SjgZg4fv2OfgPxgepxIm80JwLReAeN+Fk9GZXqIBlnWvKNA6FYQIe10Y8Q6KuPaXrbBCVE7q/kkGlMokHFdxt3ZWybyVt5w3iI29l8sf4GN9BnLwjYFNj0i+1eaUWJZRGpD8uuVbBP8zCJPHcjtuug07Q9zRRaXf6SlcSZBt4Y5dpwEuhiVRTI5JcYq6NnrxRgLoELwDgpdn17nrJAU9ILGEF/hOe7kU7c6ElZT4DFN6k7aJ8wLoQvx7HbPmNb6zsRxDhdTocyfKgi7nK0QNRJHq4u9+/SvHsIqL9Z2OB/X/DNu1acE2CH1NYkEptB6NEhLzfjKYXXRyLy6PeuHphNZt3Xdvj8DPLiuXArO/FIrgrWrR4/7jT6leR4l4SRXFLslR/iNbK9LrT8tzcCgF0L5GdvFUYv1zaNyAbtDzjW/7NSL54Jn8CBbNjQR7SNmZgc27CZL05sodp9kVJdj9dw3D/vczr58woCLKqW5qfUmhmA6MMlnJybNTbBJaEXmrma+826rQjYN6syc130HC8A6ZB+EjQP3EqJddDx1ztPd7ga1y6nwdBilm3lhWK0OwahJWdPwpDVMWKn5fcxjVSvEZ3IbHE8IOC7MW8ixV0+ML0wGycxWsvOAWJhVbMsxl5jYMeO9laIH3QOxPMna9H8fWftVUwl6bXHOg8pxHL28weFrboyyRWLA2zfahRXHd9uQ9iCSvQrJrXUiuWQt7gaUg+ZMXHE8djeHm/opL8iQdgUgyj6GTK2TQ1cHZqp+LaPsWd/WMrM2Lp3K93z+QrcM19nW/Z0hSVQGjX1mce8fthpH/DeTeWrdU7X//8ClwjeCk/1+mmpcKcvadziwBl3whOGrni055q2//JjBlTvKKAd46eqzQ1KxSFUrpD1WOYaMrIBLP98FdWiFh/h/YplmjuC+vbKKQuCkQ7bAUCUYubE1929Fr5Wsy+Mc4cjcMFvRxxQolmh8qAzxj79OTIXbqD/LdYny3lXHPAlhTgLkPw66DYHY6FUsTzEltgJTYzl68sUSXS3j/3dCzM48X17aGIRySy/XEzSsRKeimnLzEH24aOcf1Uv5afn7+YEArXjnDy/qZ5FGdAP1T95I1CA9+HlQmUQNfJwKSyI7EAflJS6yfJLNSE6JdmI+q8U2/adOQTJhSyHxXK320A30IcSmNdek+deBaJKJfV0uv0+8H9TkGGDdJYx7aVo8aiAhNyz4+E4zG98hF2L/dub3u4WzmxbQ6EznXWFhavV/P+3HsDG3KR5AD8Nd6E2H4YYe5jfQubm+ueO7F1ewLS3Zm/oBsGh1vjOrh5TKDPwrrkNlhyIP0avkOyZVlqceKvnJs6Hra+lfNKE0I/2Bob+gMZRzuYYvLtQMI7bNRG5j8zaGDl3D4+y9TsHfgeYrmEDapRRn/3csEy9D7WSRqXx10iQW3juxwoYD+f043E6mWZdrKGpBCy3v9mn0JWdScG60QxMlRaQvI8Q9JInqwfuDLK4Ov3bRaunVwmKCHaouwP6bhOWXqjhnz6Ou8JUmQ/NTLAj9WVagX9yuNb1w2WX9z/4fEW3d5zHfkrzUgcrEIszHSjZ9llgj7cXmUWQ6ZCi3uVCqC1hQDK44xGRvEvClsqZUAy+93qAkKWxCTiZ3/QGDHXeMp2otXZSMtjdLMrdRyfZJprM4grW7OfDVzACOwUMgDjNzGo/c0UVH2W/Rfx9Fiqu/69DG5aaQMAdXcXMS5h7EjFFWC4CNVShiXtMJz9P27+31CdgmRvXICV7tEqz4yxDtVZj8w6wmey9L3Y1NBVF9PDgL4te3SLkYKpxaxxG3JAdAkTWevNg8LMmMwb9fZa36MrYP4T+GnDPueHC3i0RGiLXimm+C2rbdO5CDWu4GOuidR4xmvK0ui9ayr3rdTfAa73bwjeyM8TcD9CJQHbxgC4UV6iyk597qGAv6DviI/uAA9iPQlVngQqtOjsTQS+JaKvVcjnpKC3ZUbC45fSb1ph5F/xy5GDeXReqTOSohwk5cJYhBRdxJQghfvD/5t7hMnesoY3MAalyMDevowp4VuiFuYa/bwbO/q/I6KtEQBDGU0dNpbuAx6e1LH8PpqICc6c9Swg7sBXDB7LH4oJURA9Zx+3q5CilptbxOmG3v66f+OS3d5atRyJfCfhrbt9OkxBxueLO2hsrvm8TwRedgFvyY4AcNEXADcXthjB+hD3NOn/Ny5OkIH4Ho5BZL0YiD7G9SNv1e8E2B2713iNqYYLI/tbrh4EK7GhhXKKdINFWO8Do5nQzsj5GjoUzTIW+5TeVdul4tPuq/77ZG7vWn9uCb1af1iG5APshMgmqE0aFiktAnkuZmKY0nmFGKo9VRuZ8TWL+NOgjO38tnGyFCa8XJ0C+za4T2/xhXtyhqE8MGbkzNIysVROWkUDn+aNRVxz2Gq2EPMwaf+q/OCdRIGqDxvvK6X7mQbY2ZJ+UGzfL7tFDIMBgDWZzIwJmyNpgiuZ6fv9HrTo/2e2jBXYe1xD6d7PEbH2kKELmy8KoeaWffZwrV+uRwfOiC4/qJdA8GME/r0Bu4o3ZTKysUi89sFkZtt068tXVnQrsDQyJ6+V64ORl3h1Ewq+/ixHN8csQEkKUZpTKrdMUb+6sW1oTZGShC2OPV83hmrAb2M87fuCP5cFAYBuXH9a9vPXlpuaiqdWvyY5n7uMBDcKpvL6tdxsTqq2TxBsQpY8USVJ6Pj9VNB1AlX6h+zMXdB0r2yyiGczWluzlWd23gKK5Qhlp3VThB7rDmFQOaGHhhbjI0p3+mi5gnT8si75E9aRHL4zG7gBB/XRFENKD8nz//pMsc/m22183zClJMwa6ewhTZQpy3QqAS7+QWx5eKIpAewMcD62HzK3XRbR5if3vdXz3++OOh+QSJh800GcRxUFbLrqAviwknOylBisCgUOcdl+IjYw/aRTC7/N+1drZObq/lcCZTGIUGUqwUVWB4CaUSTfi1APLPfpAaUybOTa+qzN9Z01yW8L/GlVIRtY7s8dUw7bYrx+5zs9K+XsNa2bqRIBX8OsfTCKC/oy894RT7lT6HKSpK16068X5TjCS7yEIbt7LG5xLtLnd5O9oLz8BEcu+6UhuYtFlH7OgjFROhdux/IIyJHN6NBSSW1fl/LZWL/dUSzKnkepEzFB2p1IQwPPDJVk4adxMGr37SbS9R/1IcymqM/CWyLtY18qgK4nMneqFsxF8DE1jkO+PrKdK0uBdj5kcWr3sdN0ZAocFMUrwTggX8U+uHEiSqZK+3w36a1WcDKD+MjpN183IP54BxIcKvF3gSzg9++7ES+MpANF85Y/kwTK8rTNomLkvlSMwoRUowLHxJqKLWKWAXt522ockO/rL+zWKdNKE4h/0hsTm8FhPofZtiiFKI0EO38j4cch2oHsVQtzHNAc+PGGPk497OkgdLz6hf/yREgrTAB+e7+6WMyrk2Cf/gV/3x0wv4/XclySsA58omGrwEq/PbHHFsXEIWdfkYCfJYxAGBT2QMi/oADMvFnsG5T243NWEpHRG/WPfjM/AAAAA==';

  let resultWasVisible = false;

  installV4Identity();
  installV4Layout();
  hideSourcePreviews();
  syncBodyState();

  mediaFile?.addEventListener('change', () => {
    window.setTimeout(() => {
      hideSourcePreviews();
      syncBodyState();
    }, 0);
  });

  dubBtn?.addEventListener('click', () => {
    document.body.classList.add('is-processing');
    updateProcessingStage();
  });

  copyTextBtn?.addEventListener('click', copyTranslation);
  newDubBtn?.addEventListener('click', startNewProject);

  const classObserver = new MutationObserver(() => {
    syncBodyState();
    updateProcessingStage();
    enhanceResultText();
  });

  [statusCard, resultCard].filter(Boolean).forEach(element => {
    classObserver.observe(element, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  if (statusText) {
    classObserver.observe(statusText, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  function installV4Identity() {
    if (logo) {
      logo.src = LOGO;
      logo.alt = 'ViralVoice';
    }

    const version = document.querySelector('.version-pill');
    if (version) version.textContent = '4.0';

    const kicker = document.querySelector('.brand-kicker .eyebrow');
    if (kicker) kicker.textContent = 'ViralVoice Auto';

    const tagline = document.querySelector('.brand-tagline');
    if (tagline) tagline.textContent = 'Studio de doublage OpenAI automatique';

    const title = document.querySelector('.pro-hero h1');
    if (title) title.textContent = 'Ta vidéo entre. ViralVoice s’occupe du reste.';

    const subtitle = document.querySelector('.pro-hero .subtitle');
    if (subtitle) {
      subtitle.textContent =
        'Choisis la langue. ViralVoice détecte les intervenants, sélectionne automatiquement le moteur OpenAI adapté, traduit et synchronise les voix.';
    }

    const points = document.querySelectorAll('.hero-points span');
    if (points[0]) points[0].innerHTML = '<strong>5 min</strong> par vidéo';
    if (points[1]) points[1].innerHTML = '<strong>Auto</strong> multi-intervenants';
    if (points[2]) points[2].innerHTML = '<strong>MP4</strong> prêt à publier';

    const footerStrong = document.querySelector('.app-footer strong');
    const footerSpan = document.querySelector('.app-footer span');
    if (footerStrong) footerStrong.textContent = 'ViralVoice 4.0';
    if (footerSpan) footerSpan.textContent = 'Routage OpenAI automatique · Multi-voix · Synchronisation temporelle';
  }

  function installV4Layout() {
    const languageCard = document.querySelector('[aria-labelledby="languageTitle"]');
    const languageTitle = document.getElementById('languageTitle');
    if (languageTitle) languageTitle.textContent = 'Choisis seulement la langue';

    if (languageCard) {
      const grid = languageCard.querySelector('.grid');
      if (grid) {
        const columns = Array.from(grid.children);
        columns.slice(1).forEach(column => column.classList.add('v4-technical-hidden'));
      }

      if (!document.getElementById('autoEngineCard')) {
        const card = document.createElement('div');
        card.id = 'autoEngineCard';
        card.className = 'auto-engine-card';
        card.innerHTML =
          '<div class="auto-engine-icon">AI</div>' +
          '<div><strong>Mode Auto intelligent</strong>' +
          '<p>ViralVoice analyse les voix et choisit seul le traitement OpenAI adapté. Aucun modèle à sélectionner.</p></div>' +
          '<span class="auto-live-dot">AUTO</span>';
        languageCard.appendChild(card);
      }
    }

    if (voiceCard) voiceCard.classList.add('v4-technical-card');

    const workflowLabels = document.querySelectorAll('.workflow-nav span');
    if (workflowLabels[0]) workflowLabels[0].innerHTML = '<b>1</b> Import';
    if (workflowLabels[1]) workflowLabels[1].innerHTML = '<b>2</b> Langue';
    if (workflowLabels[2]) workflowLabels[2].innerHTML = '<b>3</b> Mixage';
    if (workflowLabels[3]) workflowLabels[3].innerHTML = '<b>4</b> Résultat';

    if (dubBtn && !document.body.classList.contains('admin-free-active')) {
      dubBtn.textContent = 'Créer automatiquement';
    }

    const caption = document.querySelector('.action-caption');
    if (caption) {
      caption.textContent = 'Détection des voix, choix du moteur, traduction et synchronisation : tout est automatique.';
    }

    const style = document.createElement('style');
    style.id = 'viralvoice-v4-style';
    style.textContent = `
      :root{--v4-cyan:#35dcff;--v4-blue:#4779ff;--v4-violet:#8b5cff;--v4-pink:#ff54c8;--v4-card:rgba(14,18,38,.82);--v4-line:rgba(130,160,255,.18)}
      html{background:#050713}
      body{background:radial-gradient(circle at 18% 8%,rgba(24,154,255,.13),transparent 34%),radial-gradient(circle at 82% 15%,rgba(182,65,255,.14),transparent 32%),#050713;color:#f7f8ff}
      .app{max-width:780px;margin:0 auto;padding-bottom:120px}
      .pro-hero{position:relative;overflow:hidden;border:1px solid var(--v4-line);border-radius:30px;background:linear-gradient(145deg,rgba(7,12,30,.96),rgba(17,8,37,.94));box-shadow:0 30px 80px rgba(0,0,0,.35),0 0 42px rgba(67,116,255,.08);padding:24px 22px 28px}
      .pro-hero:before{content:'';position:absolute;width:260px;height:260px;border-radius:50%;background:rgba(55,204,255,.08);filter:blur(55px);left:-110px;top:-90px;pointer-events:none}
      .brand-row{align-items:center;gap:18px}
      .logo{width:126px!important;height:126px!important;min-width:126px!important;padding:0!important;border-radius:28px!important;overflow:hidden!important;background:#070916!important;border:1px solid rgba(90,180,255,.28)!important;box-shadow:0 0 35px rgba(48,146,255,.18)!important}
      .app-logo-img{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}
      .brand-copy{min-width:0}
      .brand-kicker{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .version-pill{background:linear-gradient(90deg,var(--v4-cyan),var(--v4-violet));color:white;border:0;font-weight:800}
      .pro-hero h1{font-size:clamp(2rem,8vw,3.2rem);line-height:1.02;letter-spacing:-.045em;margin-top:24px;background:linear-gradient(95deg,#fff 8%,#b9e9ff 44%,#d8b7ff 78%,#ffb9e9);-webkit-background-clip:text;background-clip:text;color:transparent}
      .pro-hero .subtitle{font-size:1.03rem;line-height:1.55;color:#bbc4df}
      .hero-points{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:18px}
      .hero-points span{padding:11px 8px;border-radius:14px;background:rgba(255,255,255,.035);border:1px solid var(--v4-line);text-align:center;font-size:.78rem}
      .card,.status{background:linear-gradient(150deg,rgba(17,22,45,.91),rgba(11,13,28,.88));border:1px solid var(--v4-line);box-shadow:0 16px 50px rgba(0,0,0,.22);border-radius:24px}
      .file-zone{border:1.5px dashed rgba(69,212,255,.45);background:linear-gradient(145deg,rgba(42,198,255,.06),rgba(139,92,255,.06));border-radius:22px;min-height:150px;transition:.2s ease}
      .file-zone:active{transform:scale(.985);border-color:var(--v4-cyan)}
      select,input,textarea{background:#0b1022!important;border-color:rgba(129,158,230,.22)!important;color:#f5f7ff!important;border-radius:14px!important}
      .v4-technical-hidden{display:none!important}
      .v4-technical-card{display:none!important}
      body.admin-free-active .v4-technical-card{display:block!important;opacity:.82}
      .auto-engine-card{display:grid;grid-template-columns:48px 1fr auto;align-items:center;gap:12px;margin-top:17px;padding:16px;border-radius:18px;background:linear-gradient(110deg,rgba(48,205,255,.09),rgba(138,82,255,.10),rgba(255,82,195,.06));border:1px solid rgba(82,190,255,.24)}
      .auto-engine-card .auto-engine-icon{width:48px;height:48px;border-radius:15px;display:grid;place-items:center;font-weight:900;background:linear-gradient(135deg,var(--v4-cyan),var(--v4-violet),var(--v4-pink));box-shadow:0 8px 24px rgba(83,95,255,.26)}
      .auto-engine-card strong{font-size:1rem;color:#fff}
      .auto-engine-card p{margin:4px 0 0;color:#aeb9d7;font-size:.82rem;line-height:1.4}
      .auto-live-dot{font-size:.68rem;font-weight:900;letter-spacing:.08em;color:#a9efff;border:1px solid rgba(53,220,255,.3);background:rgba(53,220,255,.09);padding:6px 8px;border-radius:999px}
      .primary,#dubBtn,.primary-download{border:0!important;background:linear-gradient(100deg,#24c9ff,#5e71ff 45%,#9c55ff 72%,#f650c5)!important;color:white!important;font-weight:900!important;box-shadow:0 14px 38px rgba(77,92,255,.27)!important;border-radius:17px!important}
      .action-dock{backdrop-filter:blur(16px);background:linear-gradient(180deg,rgba(5,7,19,0),rgba(5,7,19,.92) 25%,rgba(5,7,19,.98));padding-top:24px}
      #dubBtn{min-height:58px;font-size:1.05rem}
      .processing-card{border-color:rgba(69,210,255,.28)}
      .loader{border-top-color:var(--v4-cyan)!important;border-right-color:var(--v4-violet)!important}
      .result-check{background:linear-gradient(135deg,var(--v4-cyan),var(--v4-violet))!important}
      .plans .featured{border-color:rgba(139,92,255,.42)!important;box-shadow:0 14px 42px rgba(99,71,255,.12)}
      .workflow-nav{background:rgba(7,9,22,.7);border:1px solid var(--v4-line);border-radius:16px;padding:7px}
      .workflow-nav span.active{background:linear-gradient(100deg,rgba(53,220,255,.15),rgba(139,92,255,.16));color:#e9f7ff}
      @media(max-width:560px){.app{padding-left:12px;padding-right:12px}.pro-hero{padding:18px 16px 22px;border-radius:24px}.logo{width:96px!important;height:96px!important;min-width:96px!important;border-radius:22px!important}.brand-tagline{font-size:.78rem}.hero-points{grid-template-columns:1fr}.auto-engine-card{grid-template-columns:42px 1fr}.auto-engine-card .auto-engine-icon{width:42px;height:42px}.auto-live-dot{grid-column:2;justify-self:start}.workflow-nav span{font-size:.7rem}.card{border-radius:20px}}
    `;
    document.head.appendChild(style);
  }

  function hideSourcePreviews() {
    [sourcePreview, sourceAudioPreview].filter(Boolean).forEach(media => {
      try {
        media.pause();
        media.removeAttribute('src');
        media.load();
      } catch {
        // Déjà vide.
      }
      media.classList.add('hidden', 'source-preview-hidden');
      media.setAttribute('aria-hidden', 'true');
    });
  }

  function syncBodyState() {
    const hasFile = Boolean(mediaFile?.files?.length);
    const processing = Boolean(statusCard && !statusCard.classList.contains('hidden'));
    const hasResult = Boolean(resultCard && !resultCard.classList.contains('hidden'));

    document.body.classList.toggle('has-file', hasFile);
    document.body.classList.toggle('is-processing', processing);
    document.body.classList.toggle('has-result', hasResult);
    projectCard?.classList.toggle('file-selected', hasFile);

    if (hasResult && !resultWasVisible) {
      resultWasVisible = true;
      window.setTimeout(() => {
        resultCard.scrollIntoView({ behavior: 'auto', block: 'start' });
        resultCard.focus({ preventScroll: true });
      }, 80);
    }

    if (!hasResult) resultWasVisible = false;
  }

  function updateProcessingStage() {
    if (!statusText) return;

    const message = statusText.textContent.toLowerCase();
    const stages = Array.from(document.querySelectorAll('.processing-steps span'));
    let activeIndex = 0;

    if (message.includes('transcription') || message.includes('analyse') || message.includes('détection')) activeIndex = 1;
    if (message.includes('traduction') || message.includes('voix ia') || message.includes('création de la voix') || message.includes('moteur')) activeIndex = 2;
    if (message.includes('final') || message.includes('synchronisation') || message.includes('terminé')) activeIndex = 3;

    stages.forEach((stage, index) => {
      stage.classList.toggle('done', index < activeIndex);
      stage.classList.toggle('active', index === activeIndex);
    });
  }

  function enhanceResultText() {
    const info = document.getElementById('speakerInfo');
    if (!info || resultCard?.classList.contains('hidden')) return;
    if (info.textContent.includes('Crédit restant')) {
      info.textContent = info.textContent.replace('Crédit restant', 'Minutes restantes');
    }
  }

  async function copyTranslation() {
    const text = outputText?.value?.trim() || '';
    if (!text) {
      setTemporaryButtonText(copyTextBtn, 'Aucun texte');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setTemporaryButtonText(copyTextBtn, 'Texte copié ✓');
    } catch {
      outputText.focus();
      outputText.select();
      document.execCommand('copy');
      setTemporaryButtonText(copyTextBtn, 'Texte copié ✓');
    }
  }

  function startNewProject() {
    if (typeof window.resetResult === 'function') window.resetResult();

    if (mediaFile) {
      mediaFile.value = '';
      mediaFile.dispatchEvent(new Event('change', { bubbles: true }));
    }

    document.body.classList.remove('has-result', 'is-processing', 'has-file');
    resultWasVisible = false;
    window.setTimeout(() => {
      projectCard?.scrollIntoView({ behavior: 'auto', block: 'center' });
    }, 20);
  }

  function setTemporaryButtonText(button, text) {
    if (!button) return;
    const original = button.dataset.originalText || button.textContent;
    button.dataset.originalText = original;
    button.textContent = text;
    window.setTimeout(() => {
      button.textContent = original;
    }, 1400);
  }

  // Le client choisit uniquement la langue. Les options internes restent actives pour le backend.
  if (targetLang) targetLang.setAttribute('aria-description', 'ViralVoice choisit automatiquement le moteur OpenAI.');
  if (voiceCard) voiceCard.setAttribute('aria-hidden', 'true');

  window.VIRALVOICE_UI_VERSION = '4.0.0';
})();
