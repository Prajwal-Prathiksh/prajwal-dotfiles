'This script displays a message box when the battery is charged beyond a specified threshold (iPercent > ...)

'Ref: https://thegeekpage.com/battery-full-charged-notification-in-windows-10/

  
set oLocator = CreateObject("WbemScripting.SWbemLocator")
set oServices = oLocator.ConnectServer(".","root\wmi")
set oResults = oServices.ExecQuery("select * from batteryfullchargedcapacity")

for each oResult in oResults
   iFull = oResult.FullChargedCapacity
next

  

while (1)
  set oResults = oServices.ExecQuery("select * from batterystatus")
  for each oResult in oResults
    iRemaining = oResult.RemainingCapacity
    bCharging = oResult.Charging
  next

  iPercent = ((iRemaining / iFull) * 100) mod 100
  if bCharging and (iPercent > 90) Then msgbox "Battery is " & iPercent & "% charged"
  wscript.sleep 30000 ' 5 minutes
wend