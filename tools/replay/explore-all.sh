cd "$(dirname "$0")"
for r in / /about-us /services /gallery /contact /services/podno-grijanje /services/dizalica-topline /services/grijanje-i-toplinska-rjesenja /services/vodoinstalaterske-usluge /services/hladenje-i-klimatizacija /services/fan-coileri; do
  s=$(echo "$r" | sed 's#^/##; s#/#__#g'); [ -z "$s" ] && s=home
  for w in 1440 1000 390; do echo "node explore.js $r $w out/h4/$s-$w.json out/x-$s-$w.json"; done
done | xargs -P 3 -I{} sh -c '{}'
echo DONE
