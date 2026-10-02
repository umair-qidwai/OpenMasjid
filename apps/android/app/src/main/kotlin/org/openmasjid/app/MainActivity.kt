package org.openmasjid.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import org.openmasjid.domain.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); setContent { OpenMasjidApp() } }
}
class MainViewModel(private val repo: SiteRepository): ViewModel() {
    var state by mutableStateOf<SiteState>(SiteState.Loading); private set
    var selectedCampus by mutableStateOf<String?>(repo.campusId()); private set
    init { refresh() }
    fun refresh() { viewModelScope.launch { state=SiteState.Loading; state=repo.load() } }
    fun select(id: String) { selectedCampus=id; repo.setCampus(id) }
    fun saveUrl(url: String): Boolean = runCatching { repo.setUrl(url); true }.getOrDefault(false)
    fun repositoryBaseUrl(): String = repo.baseUrl()
}
@Composable fun OpenMasjidApp(vm: MainViewModel? = null) {
    val context = LocalContext.current
    val model = vm ?: viewModel<MainViewModel>(factory = object: androidx.lifecycle.ViewModelProvider.Factory {
        override fun <T: ViewModel> create(modelClass: Class<T>) = MainViewModel(SiteRepository(context)) as T
    })
    MaterialTheme(colorScheme = lightColorScheme(primary=Color(0xFF183C34), secondary=Color(0xFFA67C43), background=Color(0xFFF6F3EC))) {
        Surface(Modifier.fillMaxSize(), color=MaterialTheme.colorScheme.background) { when(val s=model.state) { SiteState.Loading -> Box(Modifier.fillMaxSize().padding(24.dp)){ CircularProgressIndicator() }; is SiteState.Error -> ErrorView(s.message, model::refresh); is SiteState.Ready -> Home(s.site,s.stale,model) } }
    }
}
@Composable private fun ErrorView(message:String,retry:()->Unit){ Column(Modifier.padding(24.dp), verticalArrangement=Arrangement.spacedBy(12.dp)){ Text("OpenMasjid", style=MaterialTheme.typography.headlineMedium, fontWeight=FontWeight.Bold); Text("We couldn't load your site's information."); Text(message, color=MaterialTheme.colorScheme.error); Button(onClick=retry){Text("Try again")} } }
@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun Home(site: Site, stale:Boolean, vm:MainViewModel) {
    var tab by remember { mutableIntStateOf(0) }; var detail by remember { mutableStateOf<Any?>(null) }; var showSettings by remember { mutableStateOf(false) }
    val campus = site.campuses.firstOrNull { it.id==vm.selectedCampus } ?: site.campuses.first(); LaunchedEffect(site){ if(vm.selectedCampus==null) vm.select(campus.id) }
    if(detail!=null) DetailSheet(detail!!){ detail=null }
    if(showSettings) SettingsSheet(site, vm){showSettings=false}
    Scaffold(topBar={ TopAppBar(title={Text(site.organization.name, fontWeight=FontWeight.Bold)}, actions={TextButton(onClick={showSettings=true}){Text("Settings")}})}, bottomBar={NavigationBar{listOf("Prayer","Events","News").forEachIndexed { i,label -> NavigationBarItem(selected=tab==i,onClick={tab=i},icon={},label={Text(label)})}}}){ p ->
        LazyColumn(Modifier.padding(p).padding(horizontal=16.dp), verticalArrangement=Arrangement.spacedBy(14.dp), contentPadding=PaddingValues(vertical=18.dp)) {
            if(stale) item { AssistChip(onClick={}, label={Text("Offline · showing last good update")}) }
            item { CampusPicker(site.campuses,campus,vm::select) }
            when(tab){0 -> item { PrayerCard(campus) };1 -> { items(getCampusEvents(site,campus.id)){e-> EventCard(e,{detail=e},campus) } };2 -> { items(getCampusAnnouncements(site,campus.id)){a-> AnnouncementCard(a){detail=a} } } }
        }
    }
}
@Composable private fun CampusPicker(campuses:List<Campus>, selected:Campus, onSelect:(String)->Unit){ var expanded by remember{mutableStateOf(false)}; Box{ OutlinedButton(onClick={expanded=true},Modifier.fillMaxWidth()){Text("Campus  ·  ${selected.name}")}; DropdownMenu(expanded,onDismissRequest={expanded=false}){campuses.forEach{DropdownMenuItem(text={Text(it.name)},onClick={onSelect(it.id);expanded=false})}} } }
@Composable private fun PrayerCard(campus:Campus){ val now=remember{Instant.now()}; val day=getPrayerDay(Site(1,"",Organization("","","","","","https://example.org","assets/logo.svg",Theme("#000000","#000000")),listOf(campus),emptyList(),emptyList()),campus.id,localDateISO(now,campus.timezone)); val next=nextPrayer(campus,now); Column(Modifier.fillMaxWidth().background(Color.White,MaterialTheme.shapes.large).padding(20.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){ Text(campus.city,style=MaterialTheme.typography.labelLarge,color=MaterialTheme.colorScheme.secondary); Text("Prayer times",style=MaterialTheme.typography.headlineSmall,fontWeight=FontWeight.Bold); next?.let{Text("Next · ${it.name} ${it.time}",color=MaterialTheme.colorScheme.primary,fontWeight=FontWeight.Bold)}; if(day!=null) listOf("Fajr" to day.fajr,"Sunrise" to day.sunrise,"Dhuhr" to day.dhuhr,"Asr" to day.asr,"Maghrib" to day.maghrib,"Isha" to day.isha).forEach{ Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){Text(it.first);Text(it.second,fontWeight=FontWeight.Bold)} }; Text("Iqamah: Fajr ${campus.iqamah.fajr} · Dhuhr ${campus.iqamah.dhuhr} · Asr ${campus.iqamah.asr} · Maghrib ${campus.iqamah.maghrib} · Isha ${campus.iqamah.isha}",style=MaterialTheme.typography.bodySmall); if(campus.jumuah.isNotEmpty()){Text("Jumu'ah",fontWeight=FontWeight.Bold); campus.jumuah.forEach{Text("${it.label}  ${it.time}")} } } }
@Composable private fun EventCard(e:Event,onClick:()->Unit,campus:Campus){ Card(Modifier.fillMaxWidth().clickable(onClick=onClick)){Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){Text(e.category.uppercase(),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.secondary);Text(e.title,style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold);Text(formatInstant(e.startsAt,campus.timezone));Text(e.location)}}}
@Composable private fun AnnouncementCard(a:Announcement,onClick:()->Unit){Card(Modifier.fillMaxWidth().clickable(onClick=onClick)){Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){Text("ANNOUNCEMENT",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.secondary);Text(a.title,style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold);Text(a.body,maxLines=3)}}}
private fun formatInstant(s:String,timeZone:String)=runCatching{DateTimeFormatter.ofPattern("EEE, MMM d · h:mm a").withZone(ZoneId.of(timeZone)).format(Instant.parse(s))}.getOrDefault(s)
@Composable private fun DetailSheet(value:Any,onClose:()->Unit){ AlertDialog(onDismissRequest=onClose,title={Text(if(value is Event)value.title else (value as Announcement).title)},text={Text(if(value is Event)"${value.description}\n\n${value.location}" else (value as Announcement).body)},confirmButton={TextButton(onClick=onClose){Text("Close")}}) }
@Composable private fun SettingsSheet(site:Site,vm:MainViewModel,onClose:()->Unit){ var url by remember{mutableStateOf(vm.repositoryBaseUrl())}; AlertDialog(onDismissRequest=onClose,title={Text("Settings")},text={Column(verticalArrangement=Arrangement.spacedBy(8.dp)){Text("Published HTTPS site URL");OutlinedTextField(url,{url=it},singleLine=true);Text("Refresh uses the site's published data/v1/site.json. Last good content remains available offline.",style=MaterialTheme.typography.bodySmall)}},confirmButton={TextButton(onClick={if(vm.saveUrl(url)){vm.refresh();onClose()}}){Text("Save & refresh")}},dismissButton={TextButton(onClick=onClose){Text("Cancel")}}) }
private fun openExternal(context:android.content.Context,url:String){ if(url.startsWith("https://")||url.startsWith("tel:")||url.startsWith("mailto:")) context.startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(url))) }
